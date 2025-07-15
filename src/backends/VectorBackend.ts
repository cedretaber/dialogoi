import { SearchBackend, SearchResult, Chunk } from './SearchBackend.js';
import type { VectorRepository, VectorPoint } from '../repositories/VectorRepository.js';
import type { EmbeddingService } from '../services/EmbeddingService.js';
import { getLogger } from '../logging/index.js';
import { DialogoiError } from '../errors/index.js';

const logger = getLogger();

/**
 * ベクトル検索バックエンド設定
 */
export interface VectorBackendConfig {
  /**
   * Qdrant コレクション名
   */
  collectionName: string;

  /**
   * 検索時のスコア閾値（0-1）
   */
  scoreThreshold: number;

  /**
   * ベクトル次元数
   */
  vectorDimensions: number;

  /**
   * 検索時のスニペット長
   */
  snippetLength: number;
}

/**
 * ベクトル検索バックエンド
 * EmbeddingService と VectorRepository を組み合わせてベクトル検索を提供
 */
export class VectorBackend extends SearchBackend {
  private stats: {
    memoryUsage: number;
    lastUpdated: Date;
    totalChunks: number;
  } = {
    memoryUsage: 0,
    lastUpdated: new Date(),
    totalChunks: 0,
  };

  constructor(
    private readonly vectorRepository: VectorRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly config: VectorBackendConfig,
  ) {
    super();
    logger.info('VectorBackend initialized', {
      collectionName: config.collectionName,
      scoreThreshold: config.scoreThreshold,
      vectorDimensions: config.vectorDimensions,
    });
  }

  /**
   * 初期化処理
   */
  async initialize(): Promise<void> {
    try {
      // VectorRepository の接続を確認
      if (!this.vectorRepository.isConnected()) {
        await this.vectorRepository.connect();
      }

      // EmbeddingService の初期化
      if (!this.embeddingService.isReady()) {
        await this.embeddingService.initialize();
      }

      // コレクションの作成確認
      await this.vectorRepository.ensureCollection(
        this.config.collectionName,
        this.config.vectorDimensions,
      );

      logger.info('VectorBackend initialization completed', {
        collectionName: this.config.collectionName,
        dimensions: this.embeddingService.getDimensions(),
      });
    } catch (error) {
      logger.error('VectorBackend initialization failed', error as Error);
      throw new VectorBackendError(
        `Failed to initialize VectorBackend: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * チャンクをベクトルインデックスに追加
   */
  async add(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) {
      logger.debug('No chunks to add to vector index');
      return;
    }

    try {
      logger.debug(`Adding ${chunks.length} chunks to vector index`);
      const startTime = Date.now();

      // チャンクからテキストを抽出
      const texts = chunks.map((chunk) => `${chunk.title}\n${chunk.content}`);

      // バッチでembeddingを生成
      const embeddings = await this.embeddingService.generateBatchEmbeddings(texts);

      // VectorPointに変換
      const vectorPoints: VectorPoint[] = chunks.map((chunk, index) => ({
        id: chunk.id,
        vector: embeddings[index],
        payload: {
          title: chunk.title,
          content: chunk.content,
          relativeFilePath: chunk.relativeFilePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          chunkIndex: chunk.chunkIndex,
          novelId: chunk.novelId,
          tags: chunk.tags,
          baseId: chunk.baseId,
          hash: chunk.hash,
        },
      }));

      // Qdrantに追加
      await this.vectorRepository.upsertVectors(this.config.collectionName, vectorPoints);

      // 統計情報を更新
      this.stats.totalChunks += chunks.length;
      this.stats.lastUpdated = new Date();

      const processingTime = Date.now() - startTime;
      logger.info(`Added ${chunks.length} chunks to vector index in ${processingTime}ms`);
    } catch (error) {
      logger.error('Failed to add chunks to vector index', error as Error);
      throw new VectorBackendError(
        `Failed to add chunks to vector index: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * チャンクを差分更新
   */
  async updateChunks(chunks: Chunk[]): Promise<{
    added: number;
    updated: number;
    unchanged: number;
  }> {
    if (chunks.length === 0) {
      return { added: 0, updated: 0, unchanged: 0 };
    }

    try {
      logger.debug(`Updating ${chunks.length} chunks in vector index`);
      const startTime = Date.now();

      // 既存のベクトルポイントを検索して重複チェック
      const updateResults = { added: 0, updated: 0, unchanged: 0 };

      // 簡単な実装：全て追加として扱う（実際の実装では既存チャンクとの比較が必要）
      await this.add(chunks);
      updateResults.added = chunks.length;

      const processingTime = Date.now() - startTime;
      logger.info(`Updated ${chunks.length} chunks in vector index in ${processingTime}ms`, {
        results: updateResults,
      });

      return updateResults;
    } catch (error) {
      logger.error('Failed to update chunks in vector index', error as Error);
      throw new VectorBackendError(
        `Failed to update chunks in vector index: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * 指定ファイルに関連するチャンクを削除
   * @param relativeFilePath プロジェクトルートからの相対パス
   */
  async removeByFile(relativeFilePath: string): Promise<void> {
    try {
      logger.debug(`Removing chunks from vector index for file: ${relativeFilePath}`);
      const startTime = Date.now();

      // ファイルパスでフィルタリングして削除
      await this.vectorRepository.deleteVectorsByFilePath(
        this.config.collectionName,
        relativeFilePath,
      );

      const removeTime = Date.now() - startTime;
      logger.info(`Removed chunks by file from vector index in ${removeTime}ms`, {
        relativeFilePath,
      });
    } catch (error) {
      logger.error('Failed to remove chunks by file from vector index', error as Error);
      throw new VectorBackendError(
        `Failed to remove chunks by file from vector index: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * 指定小説プロジェクトに関連するチャンクを削除
   */
  async removeByNovel(novelId: string): Promise<void> {
    try {
      logger.debug(`Removing chunks from vector index for novel: ${novelId}`);
      const startTime = Date.now();

      // 小説IDでフィルタリングして削除
      await this.vectorRepository.deleteVectorsByNovelId(this.config.collectionName, novelId);

      const removeTime = Date.now() - startTime;
      logger.info(`Removed chunks by novel from vector index in ${removeTime}ms`, { novelId });
    } catch (error) {
      logger.error('Failed to remove chunks by novel from vector index', error as Error);
      throw new VectorBackendError(
        `Failed to remove chunks by novel from vector index: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * ベクトル検索を実行
   */
  async search(query: string, k: number, novelId: string): Promise<SearchResult[]> {
    try {
      logger.debug(`Performing vector search`, { query, k, novelId });
      const startTime = Date.now();

      // クエリのembeddingを生成
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // ベクトル検索を実行
      const vectorResults = await this.vectorRepository.searchVectors(
        this.config.collectionName,
        queryEmbedding,
        k,
        this.config.scoreThreshold,
      );

      // 結果をフィルタリング（指定された小説IDのみ）
      const filteredResults = vectorResults.filter((result) => result.payload?.novelId === novelId);

      // SearchResult形式に変換
      const searchResults = filteredResults.map((result) => {
        const payload = result.payload;
        const snippet = this.generateSnippet(
          payload?.content as string,
          query,
          this.config.snippetLength,
        );

        return {
          id: result.id,
          score: result.score,
          snippet,
          payload: {
            file: payload?.relativeFilePath as string,
            start: payload?.startLine as number,
            end: payload?.endLine as number,
            tags: payload?.tags as string[],
          },
        };
      });

      const searchTime = Date.now() - startTime;
      logger.debug(`Vector search completed in ${searchTime}ms`, {
        query,
        resultCount: searchResults.length,
        k,
      });

      return searchResults;
    } catch (error) {
      logger.error('Vector search failed', error as Error);
      throw new VectorBackendError(
        `Vector search failed: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * インデックスをクリア
   */
  async clear(): Promise<void> {
    try {
      logger.info('Clearing vector index');
      await this.vectorRepository.deleteCollection(this.config.collectionName);
      await this.vectorRepository.ensureCollection(
        this.config.collectionName,
        this.config.vectorDimensions,
      );

      // 統計情報をリセット
      this.stats.totalChunks = 0;
      this.stats.lastUpdated = new Date();

      logger.info('Vector index cleared');
    } catch (error) {
      logger.error('Failed to clear vector index', error as Error);
      throw new VectorBackendError(
        `Failed to clear vector index: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * インデックスの統計情報を取得
   */
  async getStats(): Promise<{
    memoryUsage?: number;
    lastUpdated?: Date;
    totalChunks?: number;
  }> {
    try {
      // コレクション情報を取得
      const collectionInfo = await this.vectorRepository.getCollectionInfo(
        this.config.collectionName,
      );

      return {
        memoryUsage: this.stats.memoryUsage,
        lastUpdated: this.stats.lastUpdated,
        totalChunks: collectionInfo.vectorsCount,
      };
    } catch (error) {
      logger.error('Failed to get vector index stats', error as Error);
      return {
        memoryUsage: this.stats.memoryUsage,
        lastUpdated: this.stats.lastUpdated,
        totalChunks: this.stats.totalChunks,
      };
    }
  }

  /**
   * コンテンツからスニペットを生成
   */
  private generateSnippet(content: string, query: string, maxLength: number): string {
    if (!content) {
      return '';
    }

    // 簡単な実装：コンテンツの先頭から指定文字数を取得
    if (content.length <= maxLength) {
      return content;
    }

    // クエリに関連する部分を探す（簡単な実装）
    const queryWords = query.split(/\s+/);
    for (const word of queryWords) {
      const index = content.toLowerCase().indexOf(word.toLowerCase());
      if (index !== -1) {
        const start = Math.max(0, index - Math.floor(maxLength / 2));
        const end = Math.min(content.length, start + maxLength);
        let snippet = content.substring(start, end);

        // 文の境界で切る
        if (start > 0) {
          snippet = '...' + snippet;
        }
        if (end < content.length) {
          snippet = snippet + '...';
        }

        return snippet;
      }
    }

    // クエリに関連する部分が見つからない場合は先頭から
    return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
  }
}

/**
 * VectorBackend エラークラス
 */
export class VectorBackendError extends DialogoiError {
  constructor(message: string, cause?: Error) {
    super(
      message,
      'VECTOR_BACKEND_ERROR',
      cause ? { cause: cause.message, stack: cause.stack } : undefined,
    );
    this.name = 'VectorBackendError';
  }
}
