import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { TransformersEmbeddingService } from '../../src/services/TransformersEmbeddingService.js';
import { EmbeddingConfig } from '../../src/services/EmbeddingService.js';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

// モックのセットアップ
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}));

describe('TransformersEmbeddingService', () => {
  let service: TransformersEmbeddingService;
  let mockPipeline: Mock & Partial<FeatureExtractionPipeline>;

  beforeEach(async () => {
    // モックのリセット
    vi.resetAllMocks();

    // pipeline モックの設定
    mockPipeline = vi.fn() as Mock & Partial<FeatureExtractionPipeline>;
    const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
    (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);

    // デフォルト設定でサービスを初期化
    service = new TransformersEmbeddingService();
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe('constructor', () => {
    it('デフォルト設定で初期化される', () => {
      expect(service.getDimensions()).toBe(384);
      expect(service.isReady()).toBe(false);
    });

    it('カスタム設定で初期化される', () => {
      const config: Partial<EmbeddingConfig> = {
        model: 'custom-model',
        dimensions: 512,
        batchSize: 64,
        device: 'gpu',
      };

      const customService = new TransformersEmbeddingService(config);
      expect(customService.getDimensions()).toBe(512);
      expect(customService.isReady()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('モデルが正常にロードされる', async () => {
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);

      await service.initialize();

      expect(pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'intfloat/multilingual-e5-small',
        {
          device: 'cpu',
        },
      );
      expect(service.isReady()).toBe(true);
    });

    it('GPU設定でモデルがロードされる', async () => {
      const config: Partial<EmbeddingConfig> = { device: 'gpu' };
      const gpuService = new TransformersEmbeddingService(config);

      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);

      await gpuService.initialize();

      expect(pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'intfloat/multilingual-e5-small',
        {
          device: 'cuda',
        },
      );
      expect(gpuService.isReady()).toBe(true);
    });

    it('重複する初期化呼び出しが適切に処理される', async () => {
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);

      // 同時に複数回初期化を呼び出す
      const promise1 = service.initialize();
      const promise2 = service.initialize();
      const promise3 = service.initialize();

      await Promise.all([promise1, promise2, promise3]);

      // pipelineは1回だけ呼び出されるべき
      expect(pipeline).toHaveBeenCalledTimes(1);
      expect(service.isReady()).toBe(true);
    });

    it('モデルロードエラーが適切に処理される', async () => {
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      pipeline.mockRejectedValue(new Error('Model load failed'));

      await expect(service.initialize()).rejects.toThrow('Failed to load model');
      expect(service.isReady()).toBe(false);
    });
  });

  describe('generateEmbedding', () => {
    beforeEach(async () => {
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);
      await service.initialize();
    });

    it('単一のテキストでembeddingが生成される', async () => {
      const mockOutput = {
        data: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      };
      mockPipeline.mockResolvedValue(mockOutput);

      const result = await service.generateEmbedding('テストテキスト');

      expect(mockPipeline).toHaveBeenCalledWith('query: テストテキスト', {
        pooling: 'mean',
        normalize: true,
      });
      expect(result).toHaveLength(4);
      expect(result[0]).toBeCloseTo(0.1);
      expect(result[1]).toBeCloseTo(0.2);
      expect(result[2]).toBeCloseTo(0.3);
      expect(result[3]).toBeCloseTo(0.4);
    });

    it('空のテキストでembeddingが生成される', async () => {
      const mockOutput = {
        data: new Float32Array([0.0, 0.0, 0.0, 0.0]),
      };
      mockPipeline.mockResolvedValue(mockOutput);

      const result = await service.generateEmbedding('');

      expect(mockPipeline).toHaveBeenCalledWith('query: ', {
        pooling: 'mean',
        normalize: true,
      });
      expect(result).toEqual([0.0, 0.0, 0.0, 0.0]);
    });

    it('初期化されていない状態でも自動初期化される', async () => {
      const uninitializedService = new TransformersEmbeddingService();
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);

      const mockOutput = {
        data: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      };
      mockPipeline.mockResolvedValue(mockOutput);

      const result = await uninitializedService.generateEmbedding('テスト');

      expect(pipeline).toHaveBeenCalled();
      expect(result).toHaveLength(4);
      expect(result[0]).toBeCloseTo(0.1);
      expect(result[1]).toBeCloseTo(0.2);
      expect(result[2]).toBeCloseTo(0.3);
      expect(result[3]).toBeCloseTo(0.4);
    });

    it('embedding生成エラーが適切に処理される', async () => {
      mockPipeline.mockRejectedValue(new Error('Pipeline failed'));

      await expect(service.generateEmbedding('テスト')).rejects.toThrow(
        'Failed to generate embedding',
      );
    });
  });

  describe('generateBatchEmbeddings', () => {
    beforeEach(async () => {
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);
      await service.initialize();
    });

    it('複数のテキストでバッチembeddingが生成される', async () => {
      const mockOutput = {
        data: new Float32Array([
          0.1,
          0.2,
          0.3,
          0.4, // 1つ目のembedding
          0.5,
          0.6,
          0.7,
          0.8, // 2つ目のembedding
        ]),
      };
      mockPipeline.mockResolvedValue(mockOutput);

      // 次元数を4に設定したサービスを使用
      const config: Partial<EmbeddingConfig> = { dimensions: 4 };
      const batchService = new TransformersEmbeddingService(config);
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);
      await batchService.initialize();

      const texts = ['テキスト1', 'テキスト2'];
      const result = await batchService.generateBatchEmbeddings(texts);

      expect(mockPipeline).toHaveBeenCalledWith(['query: テキスト1', 'query: テキスト2'], {
        pooling: 'mean',
        normalize: true,
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(4);
      expect(result[0][0]).toBeCloseTo(0.1);
      expect(result[0][1]).toBeCloseTo(0.2);
      expect(result[0][2]).toBeCloseTo(0.3);
      expect(result[0][3]).toBeCloseTo(0.4);
      expect(result[1]).toHaveLength(4);
      expect(result[1][0]).toBeCloseTo(0.5);
      expect(result[1][1]).toBeCloseTo(0.6);
      expect(result[1][2]).toBeCloseTo(0.7);
      expect(result[1][3]).toBeCloseTo(0.8);
    });

    it('空の配列で空の結果が返される', async () => {
      const result = await service.generateBatchEmbeddings([]);
      expect(result).toEqual([]);
      expect(mockPipeline).not.toHaveBeenCalled();
    });

    it('バッチサイズを超える場合に分割処理される', async () => {
      // バッチサイズを2に設定
      const config: Partial<EmbeddingConfig> = { batchSize: 2, dimensions: 2 };
      const batchService = new TransformersEmbeddingService(config);
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);
      await batchService.initialize();

      const mockOutput = {
        data: new Float32Array([0.1, 0.2, 0.3, 0.4]), // 2つのembedding
      };
      mockPipeline.mockResolvedValue(mockOutput);

      const texts = ['テキスト1', 'テキスト2', 'テキスト3'];
      const result = await batchService.generateBatchEmbeddings(texts);

      // 2回のバッチ処理が実行されるべき
      expect(mockPipeline).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(3);
    });
  });

  describe('dispose', () => {
    it('リソースが適切にクリーンアップされる', async () => {
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);
      await service.initialize();

      expect(service.isReady()).toBe(true);

      await service.dispose();

      expect(service.isReady()).toBe(false);
    });

    it('未初期化状態でもdisposeが安全に実行される', async () => {
      await expect(service.dispose()).resolves.not.toThrow();
      expect(service.isReady()).toBe(false);
    });
  });

  describe('テキスト前処理', () => {
    beforeEach(async () => {
      const { pipeline } = vi.mocked(await import('@huggingface/transformers'));
      (pipeline as unknown as Mock).mockResolvedValue(mockPipeline);
      await service.initialize();
    });

    it('空白文字が正規化される', async () => {
      const mockOutput = {
        data: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      };
      mockPipeline.mockResolvedValue(mockOutput);

      await service.generateEmbedding('  テスト\n\tテキスト  ');

      expect(mockPipeline).toHaveBeenCalledWith('query: テスト テキスト', {
        pooling: 'mean',
        normalize: true,
      });
    });

    it('長いテキストが適切に切り詰められる', async () => {
      const mockOutput = {
        data: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      };
      mockPipeline.mockResolvedValue(mockOutput);

      const longText = 'a'.repeat(1000);
      await service.generateEmbedding(longText);

      expect(mockPipeline).toHaveBeenCalledWith(`query: ${'a'.repeat(512)}`, {
        pooling: 'mean',
        normalize: true,
      });
    });
  });
});
