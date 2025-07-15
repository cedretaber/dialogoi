import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { EmbeddingService, EmbeddingConfig } from './EmbeddingService.js';
import { getLogger } from '../logging/index.js';
import { DialogoiError } from '../errors/index.js';

const logger = getLogger();

/**
 * Hugging Face Transformersを使用したEmbedding生成サービス
 * multilingual-e5-smallモデルによる多言語対応のembedding生成を提供
 */
export class TransformersEmbeddingService implements EmbeddingService {
  private pipeline: FeatureExtractionPipeline | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly modelName: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly device: 'cpu' | 'gpu';

  constructor(config?: Partial<EmbeddingConfig>) {
    this.modelName = config?.model || 'intfloat/multilingual-e5-small';
    this.dimensions = config?.dimensions || 384;
    this.batchSize = config?.batchSize || 32;
    this.device = config?.device || 'cpu';

    logger.info('TransformersEmbeddingService initialized', {
      model: this.modelName,
      dimensions: this.dimensions,
      batchSize: this.batchSize,
      device: this.device,
    });
  }

  /**
   * サービスを初期化（モデルのロード）
   */
  async initialize(): Promise<void> {
    // 既に初期化中または初期化済みの場合は、既存のPromiseを返す
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // 既に初期化済みの場合は何もしない
    if (this.pipeline) {
      return;
    }

    this.initializationPromise = this.loadModel();
    return this.initializationPromise;
  }

  /**
   * モデルをロード
   */
  private async loadModel(): Promise<void> {
    try {
      logger.info(`Loading embedding model: ${this.modelName}`);
      const startTime = Date.now();

      // feature-extraction パイプラインを作成
      const result = await pipeline('feature-extraction', this.modelName, {
        device: this.device === 'gpu' ? 'cuda' : 'cpu',
      });
      this.pipeline = result as FeatureExtractionPipeline;

      const loadTime = Date.now() - startTime;
      logger.info(`Model loaded successfully in ${loadTime}ms`);
    } catch (error) {
      logger.error('Failed to load embedding model', error as Error);
      throw new EmbeddingModelLoadError(
        `Failed to load model ${this.modelName}: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * 単一のテキストをembeddingベクトルに変換
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.pipeline) {
      await this.initialize();
    }

    if (!this.pipeline) {
      throw new EmbeddingServiceNotInitializedError('Embedding service not initialized');
    }

    try {
      const startTime = Date.now();

      // テキストを前処理（multilingual-e5-smallの推奨形式）
      const processedText = this.preprocessText(text);

      // embeddingを生成
      const output = await this.pipeline(processedText, {
        pooling: 'mean', // mean poolingを使用
        normalize: true, // 正規化
      });

      // Tensor から配列に変換
      const embedding = Array.from(output.data as Float32Array);

      const processTime = Date.now() - startTime;
      logger.debug(`Generated embedding in ${processTime}ms`, {
        textLength: text.length,
        dimensions: embedding.length,
      });

      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding', error as Error);
      throw new EmbeddingGenerationError(
        `Failed to generate embedding: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * 複数のテキストを一括でembeddingベクトルに変換
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.pipeline) {
      await this.initialize();
    }

    if (!this.pipeline) {
      throw new EmbeddingServiceNotInitializedError('Embedding service not initialized');
    }

    if (texts.length === 0) {
      return [];
    }

    try {
      const embeddings: number[][] = [];
      const startTime = Date.now();

      // バッチサイズごとに処理
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize);
        const processedBatch = batch.map((text) => this.preprocessText(text));

        // バッチ処理でembeddingを生成
        const outputs = await this.pipeline(processedBatch, {
          pooling: 'mean',
          normalize: true,
        });

        // 各テキストのembeddingを抽出
        for (let j = 0; j < batch.length; j++) {
          const embedding = Array.from(
            outputs.data.slice(j * this.dimensions, (j + 1) * this.dimensions) as Float32Array,
          );
          embeddings.push(embedding);
        }

        logger.debug(
          `Processed batch ${i / this.batchSize + 1}/${Math.ceil(texts.length / this.batchSize)}`,
        );
      }

      const processTime = Date.now() - startTime;
      logger.info(`Generated ${texts.length} embeddings in ${processTime}ms`, {
        averageTime: processTime / texts.length,
        batchSize: this.batchSize,
      });

      return embeddings;
    } catch (error) {
      logger.error('Failed to generate batch embeddings', error as Error);
      throw new EmbeddingGenerationError(
        `Failed to generate batch embeddings: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * embeddingベクトルの次元数を取得
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * サービスが初期化済みで利用可能かを確認
   */
  isReady(): boolean {
    return this.pipeline !== null;
  }

  /**
   * リソースをクリーンアップ
   */
  async dispose(): Promise<void> {
    if (this.pipeline) {
      // pipelineのクリーンアップ
      this.pipeline = null;
      this.initializationPromise = null;
      logger.info('TransformersEmbeddingService disposed');
    }
  }

  /**
   * テキストの前処理
   * multilingual-e5-smallの推奨形式に変換
   */
  private preprocessText(text: string): string {
    // 空白文字の正規化
    let processed = text.trim().replace(/\s+/g, ' ');

    // 最大トークン数に制限（モデルの制限に応じて調整）
    const maxLength = 512;
    if (processed.length > maxLength) {
      processed = processed.substring(0, maxLength);
      logger.debug(`Text truncated to ${maxLength} characters`);
    }

    // multilingual-e5-small の推奨プレフィックスを追加
    return `query: ${processed}`;
  }
}

/**
 * Embedding関連のエラークラス
 */
export class EmbeddingError extends DialogoiError {
  constructor(message: string, cause?: Error) {
    super(
      message,
      'EMBEDDING_ERROR',
      cause ? { cause: cause.message, stack: cause.stack } : undefined,
    );
  }
}

export class EmbeddingModelLoadError extends EmbeddingError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'EmbeddingModelLoadError';
  }
}

export class EmbeddingServiceNotInitializedError extends EmbeddingError {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingServiceNotInitializedError';
  }
}

export class EmbeddingGenerationError extends EmbeddingError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'EmbeddingGenerationError';
  }
}
