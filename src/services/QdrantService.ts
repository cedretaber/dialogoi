import { QdrantClient, type Schemas } from '@qdrant/js-client-rest';
import { getLogger } from '../logging/index.js';
import { DialogoiError } from '../errors/index.js';

const logger = getLogger();

/**
 * Qdrantベクトルデータベースサービス
 * チャンクのベクトル化とベクトル検索機能を提供
 */
export class QdrantService {
  private client: QdrantClient;
  private isConnected: boolean = false;

  constructor(private readonly config: QdrantConfig) {
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });

    logger.info('QdrantService initialized', {
      url: config.url,
      hasApiKey: !!config.apiKey,
      timeout: config.timeout,
    });
  }

  /**
   * Qdrantサーバーへの接続を確認
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      logger.info('Connecting to Qdrant server...');
      const startTime = Date.now();

      // ヘルスチェック
      await this.client.versionInfo();

      this.isConnected = true;
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
   * ポイントの一括挿入・更新
   */
  async upsertPoints(collectionName: string, points: Schemas['PointStruct'][]): Promise<void> {
    await this.connect();

    if (points.length === 0) {
      logger.debug('No points to upsert');
      return;
    }

    try {
      logger.debug(`Upserting ${points.length} points to collection: ${collectionName}`);
      const startTime = Date.now();

      await this.client.upsert(collectionName, {
        wait: true, // 操作の完了を待つ
        points,
      });

      const upsertTime = Date.now() - startTime;
      logger.info(`Upserted ${points.length} points in ${upsertTime}ms`, {
        collection: collectionName,
        pointCount: points.length,
      });
    } catch (error) {
      logger.error(`Failed to upsert points to collection: ${collectionName}`, error as Error);
      throw new QdrantUpsertError(
        `Failed to upsert ${points.length} points to ${collectionName}: ${(error as Error).message}`,
        collectionName,
        points.length,
        error as Error,
      );
    }
  }

  /**
   * ベクトル検索
   */
  async searchPoints(
    collectionName: string,
    vector: number[],
    limit: number,
    scoreThreshold?: number,
  ): Promise<Schemas['ScoredPoint'][]> {
    await this.connect();

    try {
      logger.debug(`Searching in collection: ${collectionName}`);
      const startTime = Date.now();

      const searchResult = await this.client.search(collectionName, {
        vector,
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

      return searchResult;
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
   * ポイントの削除
   */
  async deletePoints(collectionName: string, pointIds: string[]): Promise<void> {
    await this.connect();

    if (pointIds.length === 0) {
      logger.debug('No points to delete');
      return;
    }

    try {
      logger.debug(`Deleting ${pointIds.length} points from collection: ${collectionName}`);
      const startTime = Date.now();

      await this.client.delete(collectionName, {
        wait: true, // 操作の完了を待つ
        points: pointIds,
      });

      const deleteTime = Date.now() - startTime;
      logger.info(`Deleted ${pointIds.length} points in ${deleteTime}ms`, {
        collection: collectionName,
        pointCount: pointIds.length,
      });
    } catch (error) {
      logger.error(`Failed to delete points from collection: ${collectionName}`, error as Error);
      throw new QdrantDeleteError(
        `Failed to delete ${pointIds.length} points from ${collectionName}: ${(error as Error).message}`,
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
  async getCollectionInfo(collectionName: string): Promise<unknown> {
    await this.connect();

    try {
      const info = await this.client.getCollection(collectionName);
      logger.debug(`Retrieved collection info: ${collectionName}`);
      return info;
    } catch (error) {
      logger.error(`Failed to get collection info: ${collectionName}`, error as Error);
      throw new QdrantCollectionError(
        `Failed to get collection info ${collectionName}: ${(error as Error).message}`,
        collectionName,
        error as Error,
      );
    }
  }

  /**
   * 接続状態の確認
   */
  isConnectedToQdrant(): boolean {
    return this.isConnected;
  }

  /**
   * 接続を閉じる
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      // QdrantClientには明示的なdisconnectメソッドがないため、フラグのみリセット
      this.isConnected = false;
      logger.info('Disconnected from Qdrant');
    }
  }
}

/**
 * Qdrantサービスの設定
 */
export interface QdrantConfig {
  /**
   * QdrantサーバーのURL
   */
  url: string;

  /**
   * APIキー（オプション）
   */
  apiKey?: string;

  /**
   * タイムアウト時間（ミリ秒）
   */
  timeout: number;

  /**
   * デフォルトのコレクション名
   */
  defaultCollection: string;
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
    public readonly pointCount: number,
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
    public readonly pointCount: number,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'QdrantDeleteError';
  }
}
