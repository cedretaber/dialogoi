import { QdrantClient, type Schemas } from '@qdrant/js-client-rest';
import { getLogger } from '../logging/index.js';
import { DialogoiError } from '../errors/index.js';
import { generatePointId } from '../lib/idUtils.js';
import type {
  VectorRepository,
  VectorPoint,
  VectorSearchResult,
  CollectionInfo,
  VectorRepositoryConfig,
} from './VectorRepository.js';

export type { VectorRepositoryConfig };

const logger = getLogger();

/**
 * Qdrantベクトルデータベースリポジトリ
 * VectorRepositoryインターフェースの実装としてQdrantを使用
 */
export class QdrantVectorRepository implements VectorRepository {
  private client: QdrantClient;
  private connectionState: boolean = false;

  constructor(private readonly config: VectorRepositoryConfig) {
    // URL未設定の場合はデフォルトのlocalhostを使用
    const url = config.url || 'http://localhost:6333';

    this.client = new QdrantClient({
      url,
      apiKey: config.apiKey,
    });

    logger.info('QdrantVectorRepository initialized', {
      url,
      hasApiKey: !!config.apiKey,
      timeout: config.timeout,
    });
  }

  /**
   * Qdrantサーバーへの接続を確認
   */
  async connect(): Promise<void> {
    if (this.connectionState) {
      return;
    }

    try {
      logger.info('Connecting to Qdrant server...');
      const startTime = Date.now();

      // ヘルスチェック
      await this.client.versionInfo();

      this.connectionState = true;
      const connectTime = Date.now() - startTime;
      logger.info(`Connected to Qdrant successfully in ${connectTime}ms`);
    } catch (error) {
      logger.error('Failed to connect to Qdrant', error as Error);
      throw new QdrantConnectionError(
        `Failed to connect to Qdrant at ${this.config.url}: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * 接続を閉じる
   */
  async disconnect(): Promise<void> {
    if (this.connectionState) {
      // QdrantClientには明示的なdisconnectメソッドがないため、フラグのみリセット
      this.connectionState = false;
      logger.info('Disconnected from Qdrant');
    }
  }

  /**
   * 接続状態を確認
   */
  isConnected(): boolean {
    return this.connectionState;
  }

  /**
   * コレクションの存在確認と作成
   */
  async ensureCollection(collectionName: string, vectorSize: number): Promise<void> {
    await this.connect();

    try {
      // コレクションの存在確認
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (collection) => collection.name === collectionName,
      );

      if (!exists) {
        logger.info(`Creating collection: ${collectionName}`);
        await this.client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: 'Cosine', // コサイン類似度を使用
          },
        });
        logger.info(`Collection created: ${collectionName}`);

        // payloadインデックスを設定
        await this.createPayloadIndexes(collectionName);
      } else {
        logger.debug(`Collection already exists: ${collectionName}`);
      }
    } catch (error) {
      logger.error(`Failed to ensure collection: ${collectionName}`, error as Error);
      throw new QdrantCollectionError(
        `Failed to ensure collection ${collectionName}: ${(error as Error).message}`,
        collectionName,
        error as Error,
      );
    }
  }

  /**
   * payloadインデックスの作成
   * @param collectionName コレクション名
   */
  private async createPayloadIndexes(collectionName: string): Promise<void> {
    try {
      // novelIdのインデックスを作成（高選択性）
      await this.client.createPayloadIndex(collectionName, {
        field_name: 'novelId',
        field_schema: 'keyword',
      });
      logger.info(`Created payload index for novelId in collection: ${collectionName}`);

      // fileTypeのインデックスを作成（中選択性）
      await this.client.createPayloadIndex(collectionName, {
        field_name: 'fileType',
        field_schema: 'keyword',
      });
      logger.info(`Created payload index for fileType in collection: ${collectionName}`);

      // relativeFilePathのインデックスを作成（高選択性）
      await this.client.createPayloadIndex(collectionName, {
        field_name: 'relativeFilePath',
        field_schema: 'keyword',
      });
      logger.info(`Created payload index for relativeFilePath in collection: ${collectionName}`);
    } catch (error) {
      logger.error(
        `Failed to create payload indexes for collection: ${collectionName}`,
        error as Error,
      );
      // インデックス作成失敗は致命的ではないため、エラーを投げない
    }
  }

  /**
   * ベクトルポイントの一括挿入・更新
   */
  async upsertVectors(collectionName: string, vectors: VectorPoint[]): Promise<void> {
    await this.connect();

    if (vectors.length === 0) {
      logger.debug('No vectors to upsert');
      return;
    }

    try {
      logger.debug(`Upserting ${vectors.length} vectors to collection: ${collectionName}`);
      const startTime = Date.now();

      // VectorPointをQdrantのPointStruct形式に変換
      const points: Schemas['PointStruct'][] = vectors.map((vector) => ({
        id: generatePointId(vector.id),
        vector: vector.vector,
        payload: {
          ...vector.payload,
          originalId: vector.id, // 元のIDを保持
          relativeFilePath: vector.payload?.relativeFilePath, // 検索用のキーとして明示的に設定
        },
      }));

      await this.client.upsert(collectionName, {
        wait: true, // 操作の完了を待つ
        points,
      });

      const upsertTime = Date.now() - startTime;
      logger.info(`Upserted ${vectors.length} vectors in ${upsertTime}ms`, {
        collection: collectionName,
        vectorCount: vectors.length,
      });
    } catch (error) {
      logger.error(`Failed to upsert vectors to collection: ${collectionName}`, error as Error);
      throw new QdrantUpsertError(
        `Failed to upsert ${vectors.length} vectors to ${collectionName}: ${(error as Error).message}`,
        collectionName,
        vectors.length,
        error as Error,
      );
    }
  }

  /**
   * ベクトル検索
   */
  async searchVectors(
    collectionName: string,
    queryVector: number[],
    limit: number,
    scoreThreshold?: number,
  ): Promise<VectorSearchResult[]> {
    await this.connect();

    try {
      logger.debug(`Searching in collection: ${collectionName}`);
      const startTime = Date.now();

      const searchResult = await this.client.search(collectionName, {
        vector: queryVector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true, // メタデータも取得
      });

      const searchTime = Date.now() - startTime;
      logger.debug(`Search completed in ${searchTime}ms`, {
        collection: collectionName,
        resultCount: searchResult.length,
        limit,
        scoreThreshold,
      });

      // QdrantのScoredPointをVectorSearchResultに変換
      return searchResult.map((point) => ({
        id: (point.payload?.originalId as string) || point.id.toString(), // 元のIDを復元
        score: point.score,
        payload: point.payload || undefined,
        vector:
          Array.isArray(point.vector) && point.vector.every((v) => typeof v === 'number')
            ? point.vector
            : undefined,
      }));
    } catch (error) {
      logger.error(`Failed to search in collection: ${collectionName}`, error as Error);
      throw new QdrantSearchError(
        `Failed to search in collection ${collectionName}: ${(error as Error).message}`,
        collectionName,
        error as Error,
      );
    }
  }

  /**
   * ファイルパスによるベクトルポイントの削除
   * @param relativeFilePath プロジェクトルートからの相対パス
   */
  async deleteVectorsByFilePath(collectionName: string, relativeFilePath: string): Promise<void> {
    await this.connect();

    try {
      logger.debug(`Deleting vectors by file path from collection: ${collectionName}`, {
        relativeFilePath,
      });
      const startTime = Date.now();

      // payloadのrelativeFilePathでフィルタリングして削除
      await this.client.delete(collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'relativeFilePath',
              match: { value: relativeFilePath },
            },
          ],
        },
      });

      const deleteTime = Date.now() - startTime;
      logger.info(`Deleted vectors by file path in ${deleteTime}ms`, {
        collection: collectionName,
        relativeFilePath,
      });
    } catch (error) {
      logger.error(
        `Failed to delete vectors by file path from collection: ${collectionName}`,
        error as Error,
      );
      throw new QdrantDeleteError(
        `Failed to delete vectors by file path from ${collectionName}: ${(error as Error).message}`,
        collectionName,
        0, // 削除数は不明
        error as Error,
      );
    }
  }

  /**
   * 小説IDによるベクトルポイントの削除
   */
  async deleteVectorsByNovelId(collectionName: string, novelId: string): Promise<void> {
    await this.connect();

    try {
      logger.debug(`Deleting vectors by novel ID from collection: ${collectionName}`, { novelId });
      const startTime = Date.now();

      // payloadのnovelIdでフィルタリングして削除
      await this.client.delete(collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'novelId',
              match: { value: novelId },
            },
          ],
        },
      });

      const deleteTime = Date.now() - startTime;
      logger.info(`Deleted vectors by novel ID in ${deleteTime}ms`, {
        collection: collectionName,
        novelId,
      });
    } catch (error) {
      logger.error(
        `Failed to delete vectors by novel ID from collection: ${collectionName}`,
        error as Error,
      );
      throw new QdrantDeleteError(
        `Failed to delete vectors by novel ID from ${collectionName}: ${(error as Error).message}`,
        collectionName,
        0, // 削除数は不明
        error as Error,
      );
    }
  }

  /**
   * ベクトルポイントの削除
   */
  async deleteVectors(collectionName: string, pointIds: string[]): Promise<void> {
    await this.connect();

    if (pointIds.length === 0) {
      logger.debug('No vectors to delete');
      return;
    }

    try {
      logger.debug(`Deleting ${pointIds.length} vectors from collection: ${collectionName}`);
      const startTime = Date.now();

      // 文字列IDをUUIDに変換
      const qdrantPointIds = pointIds.map((id) => generatePointId(id));

      await this.client.delete(collectionName, {
        wait: true, // 操作の完了を待つ
        points: qdrantPointIds,
      });

      const deleteTime = Date.now() - startTime;
      logger.info(`Deleted ${pointIds.length} vectors in ${deleteTime}ms`, {
        collection: collectionName,
        vectorCount: pointIds.length,
      });
    } catch (error) {
      logger.error(`Failed to delete vectors from collection: ${collectionName}`, error as Error);
      throw new QdrantDeleteError(
        `Failed to delete ${pointIds.length} vectors from ${collectionName}: ${(error as Error).message}`,
        collectionName,
        pointIds.length,
        error as Error,
      );
    }
  }

  /**
   * コレクションの削除
   */
  async deleteCollection(collectionName: string): Promise<void> {
    await this.connect();

    try {
      logger.info(`Deleting collection: ${collectionName}`);
      await this.client.deleteCollection(collectionName);
      logger.info(`Collection deleted: ${collectionName}`);
    } catch (error) {
      logger.error(`Failed to delete collection: ${collectionName}`, error as Error);
      throw new QdrantCollectionError(
        `Failed to delete collection ${collectionName}: ${(error as Error).message}`,
        collectionName,
        error as Error,
      );
    }
  }

  /**
   * コレクション情報の取得
   */
  async getCollectionInfo(collectionName: string): Promise<CollectionInfo> {
    await this.connect();

    try {
      const info = await this.client.getCollection(collectionName);
      logger.debug(`Retrieved collection info: ${collectionName}`);

      // Qdrantのレスポンスを共通インターフェースに変換
      const qdrantInfo = info as {
        status?: string;
        vectors_count?: number;
        indexed_vectors_count?: number;
        [key: string]: unknown;
      };

      return {
        status: qdrantInfo.status || 'unknown',
        vectorsCount: qdrantInfo.vectors_count || 0,
        indexedVectorsCount: qdrantInfo.indexed_vectors_count || 0,
        ...qdrantInfo,
      };
    } catch (error) {
      logger.error(`Failed to get collection info: ${collectionName}`, error as Error);
      throw new QdrantCollectionError(
        `Failed to get collection info ${collectionName}: ${(error as Error).message}`,
        collectionName,
        error as Error,
      );
    }
  }
}

/**
 * Qdrant関連エラーの基底クラス
 */
export class QdrantError extends DialogoiError {
  constructor(message: string, cause?: Error) {
    super(
      message,
      'QDRANT_ERROR',
      cause ? { cause: cause.message, stack: cause.stack } : undefined,
    );
  }
}

/**
 * Qdrant接続エラー
 */
export class QdrantConnectionError extends QdrantError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'QdrantConnectionError';
  }
}

/**
 * Qdrantコレクション操作エラー
 */
export class QdrantCollectionError extends QdrantError {
  constructor(
    message: string,
    public readonly collectionName: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'QdrantCollectionError';
  }
}

/**
 * Qdrant検索エラー
 */
export class QdrantSearchError extends QdrantError {
  constructor(
    message: string,
    public readonly collectionName: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'QdrantSearchError';
  }
}

/**
 * Qdrantアップサートエラー
 */
export class QdrantUpsertError extends QdrantError {
  constructor(
    message: string,
    public readonly collectionName: string,
    public readonly vectorCount: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'QdrantUpsertError';
  }
}

/**
 * Qdrant削除エラー
 */
export class QdrantDeleteError extends QdrantError {
  constructor(
    message: string,
    public readonly collectionName: string,
    public readonly vectorCount: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'QdrantDeleteError';
  }
}
