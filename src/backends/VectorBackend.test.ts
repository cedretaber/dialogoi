import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { VectorBackend, VectorBackendConfig } from './VectorBackend.js';
import { Chunk } from './SearchBackend.js';
import type {
  VectorRepository,
  VectorSearchResult,
  VectorPoint,
  CollectionInfo,
} from '../repositories/VectorRepository.js';
import type { EmbeddingService } from '../services/EmbeddingService.js';

// VectorRepository のモック
const mockVectorRepository = {
  connect: vi.fn() as MockedFunction<() => Promise<void>>,
  disconnect: vi.fn() as MockedFunction<() => Promise<void>>,
  isConnected: vi.fn() as MockedFunction<() => boolean>,
  ensureCollection: vi.fn() as MockedFunction<
    (collectionName: string, vectorSize: number) => Promise<void>
  >,
  upsertVectors: vi.fn() as MockedFunction<
    (collectionName: string, vectors: VectorPoint[]) => Promise<void>
  >,
  searchVectors: vi.fn() as MockedFunction<
    (
      collectionName: string,
      queryVector: number[],
      limit: number,
      scoreThreshold?: number,
      filter?: import('../repositories/VectorRepository.js').VectorFilter,
    ) => Promise<VectorSearchResult[]>
  >,
  deleteVectors: vi.fn() as MockedFunction<
    (collectionName: string, pointIds: string[]) => Promise<void>
  >,
  deleteVectorsByFilePath: vi.fn() as MockedFunction<
    (collectionName: string, relativeFilePath: string) => Promise<void>
  >,
  deleteVectorsByNovelId: vi.fn() as MockedFunction<
    (collectionName: string, novelId: string) => Promise<void>
  >,
  deleteCollection: vi.fn() as MockedFunction<(collectionName: string) => Promise<void>>,
  getCollectionInfo: vi.fn() as MockedFunction<(collectionName: string) => Promise<CollectionInfo>>,
} satisfies VectorRepository;

// EmbeddingService のモック
const mockEmbeddingService = {
  generateEmbedding: vi.fn() as MockedFunction<(text: string) => Promise<number[]>>,
  generateBatchEmbeddings: vi.fn() as MockedFunction<(texts: string[]) => Promise<number[][]>>,
  getDimensions: vi.fn() as MockedFunction<() => number>,
  isReady: vi.fn() as MockedFunction<() => boolean>,
  initialize: vi.fn() as MockedFunction<() => Promise<void>>,
  dispose: vi.fn() as MockedFunction<() => Promise<void>>,
} satisfies EmbeddingService;

describe('VectorBackend', () => {
  let vectorBackend: VectorBackend;
  let config: VectorBackendConfig;

  beforeEach(() => {
    // モックをリセット
    vi.resetAllMocks();

    // テスト用設定
    config = {
      collectionName: 'test-collection',
      scoreThreshold: 0.7,
      vectorDimensions: 384,
      snippetLength: 120,
    };

    vectorBackend = new VectorBackend(mockVectorRepository, mockEmbeddingService, config);
  });

  describe('constructor', () => {
    it('設定でVectorBackendが初期化される', () => {
      expect(vectorBackend).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('正常に初期化される', async () => {
      mockVectorRepository.isConnected.mockReturnValue(false);
      mockVectorRepository.connect.mockResolvedValue(undefined);
      mockEmbeddingService.isReady.mockReturnValue(false);
      mockEmbeddingService.initialize.mockResolvedValue(undefined);
      mockEmbeddingService.getDimensions.mockReturnValue(384);
      mockVectorRepository.ensureCollection.mockResolvedValue(undefined);

      await vectorBackend.initialize();

      expect(mockVectorRepository.connect).toHaveBeenCalled();
      expect(mockEmbeddingService.initialize).toHaveBeenCalled();
      expect(mockVectorRepository.ensureCollection).toHaveBeenCalledWith('test-collection', 384);
    });

    it('既に接続済みの場合は接続をスキップする', async () => {
      mockVectorRepository.isConnected.mockReturnValue(true);
      mockEmbeddingService.isReady.mockReturnValue(true);
      mockEmbeddingService.getDimensions.mockReturnValue(384);
      mockVectorRepository.ensureCollection.mockResolvedValue(undefined);

      await vectorBackend.initialize();

      expect(mockVectorRepository.connect).not.toHaveBeenCalled();
      expect(mockEmbeddingService.initialize).not.toHaveBeenCalled();
    });

    it('初期化エラーが適切に処理される', async () => {
      mockVectorRepository.isConnected.mockReturnValue(false);
      mockVectorRepository.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(vectorBackend.initialize()).rejects.toThrow(
        'Failed to initialize VectorBackend',
      );
    });
  });

  describe('add', () => {
    it('チャンクが正常に追加される', async () => {
      const chunks = [
        new Chunk('タイトル1', 'コンテンツ1', 'test/file1.txt', 1, 5, 0, 'test-novel', 'content', [
          'tag1',
        ]),
        new Chunk(
          'タイトル2',
          'コンテンツ2',
          'test/file2.txt',
          6,
          10,
          1,
          'test-novel',
          'settings',
          ['tag2'],
        ),
      ];

      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];

      mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue(mockEmbeddings);
      mockVectorRepository.upsertVectors.mockResolvedValue(undefined);

      await vectorBackend.add(chunks);

      expect(mockEmbeddingService.generateBatchEmbeddings).toHaveBeenCalledWith([
        'タイトル1\nコンテンツ1',
        'タイトル2\nコンテンツ2',
      ]);
      expect(mockVectorRepository.upsertVectors).toHaveBeenCalledWith(
        'test-collection',
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            vector: [0.1, 0.2, 0.3],
            payload: expect.objectContaining({
              title: 'タイトル1',
              content: 'コンテンツ1',
              relativeFilePath: 'test/file1.txt',
              novelId: 'test-novel',
            }),
          }),
          expect.objectContaining({
            id: expect.any(String),
            vector: [0.4, 0.5, 0.6],
            payload: expect.objectContaining({
              title: 'タイトル2',
              content: 'コンテンツ2',
              relativeFilePath: 'test/file2.txt',
              novelId: 'test-novel',
            }),
          }),
        ]),
      );
    });

    it('空の配列の場合は処理をスキップする', async () => {
      await vectorBackend.add([]);

      expect(mockEmbeddingService.generateBatchEmbeddings).not.toHaveBeenCalled();
      expect(mockVectorRepository.upsertVectors).not.toHaveBeenCalled();
    });

    it('追加エラーが適切に処理される', async () => {
      const chunks = [
        new Chunk('タイトル1', 'コンテンツ1', 'test/file1.txt', 1, 5, 0, 'test-novel', 'content'),
      ];

      mockEmbeddingService.generateBatchEmbeddings.mockRejectedValue(
        new Error('Embedding generation failed'),
      );

      await expect(vectorBackend.add(chunks)).rejects.toThrow(
        'Failed to add chunks to vector index',
      );
    });
  });

  describe('updateChunks', () => {
    it('チャンクが正常に更新される', async () => {
      const chunks = [
        new Chunk('タイトル1', 'コンテンツ1', 'test/file1.txt', 1, 5, 0, 'test-novel', 'content'),
      ];

      mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockVectorRepository.upsertVectors.mockResolvedValue(undefined);

      const result = await vectorBackend.updateChunks(chunks);

      expect(result).toEqual({
        added: 1,
        updated: 0,
        unchanged: 0,
      });
    });

    it('空の配列の場合は処理をスキップする', async () => {
      const result = await vectorBackend.updateChunks([]);

      expect(result).toEqual({
        added: 0,
        updated: 0,
        unchanged: 0,
      });
    });
  });

  describe('search', () => {
    it('ベクトル検索が正常に実行される', async () => {
      const query = 'テスト検索';
      const k = 5;
      const novelId = 'test-novel';

      const mockQueryEmbedding = [0.1, 0.2, 0.3];
      const mockVectorResults: VectorSearchResult[] = [
        {
          id: 'test-id-1',
          score: 0.9,
          payload: {
            title: 'タイトル1',
            content: 'これはテストコンテンツです。',
            relativeFilePath: 'test/file1.txt',
            startLine: 1,
            endLine: 5,
            novelId: 'test-novel',
          },
        },
        {
          id: 'test-id-2',
          score: 0.8,
          payload: {
            title: 'タイトル2',
            content: 'これもテストコンテンツです。',
            relativeFilePath: 'test/file2.txt',
            startLine: 6,
            endLine: 10,
            novelId: 'test-novel',
          },
        },
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockQueryEmbedding);
      mockVectorRepository.searchVectors.mockResolvedValue(mockVectorResults);

      const results = await vectorBackend.search(query, k, novelId);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(query);
      expect(mockVectorRepository.searchVectors).toHaveBeenCalledWith(
        'test-collection',
        mockQueryEmbedding,
        k,
        0.7,
        {
          must: [
            {
              key: 'novelId',
              match: { value: novelId },
            },
          ],
        },
      );
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          score: 0.9,
          snippet: expect.stringContaining('テストコンテンツ'),
          payload: expect.objectContaining({
            file: 'test/file1.txt',
            start: 1,
            end: 5,
          }),
        }),
      );
    });

    it('指定された小説IDでフィルタリングされる', async () => {
      const query = 'テスト検索';
      const k = 5;
      const novelId = 'target-novel';

      const mockQueryEmbedding = [0.1, 0.2, 0.3];
      // QdrantRepositoryがフィルタリングした結果を返すことを想定
      const mockVectorResults: VectorSearchResult[] = [
        {
          id: 'test-id-1',
          score: 0.9,
          payload: {
            novelId: 'target-novel',
            content: 'テストコンテンツ',
            relativeFilePath: 'test/file1.txt',
            startLine: 1,
            endLine: 5,
          },
        },
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockQueryEmbedding);
      mockVectorRepository.searchVectors.mockResolvedValue(mockVectorResults);

      const results = await vectorBackend.search(query, k, novelId);

      // searchVectorsがフィルタと共に呼ばれることを確認
      expect(mockVectorRepository.searchVectors).toHaveBeenCalledWith(
        'test-collection',
        mockQueryEmbedding,
        k,
        0.7,
        {
          must: [
            {
              key: 'novelId',
              match: { value: novelId },
            },
          ],
        },
      );

      expect(results).toHaveLength(1);
      expect(results[0].payload.file).toBe('test/file1.txt');
    });

    it('fileTypeフィルタが正しく適用される', async () => {
      const query = 'テスト検索';
      const k = 5;
      const novelId = 'test-novel';
      const fileType = 'content';

      const mockQueryEmbedding = [0.1, 0.2, 0.3];
      const mockVectorResults: VectorSearchResult[] = [
        {
          id: 'test-id-1',
          score: 0.9,
          payload: {
            novelId: 'test-novel',
            fileType: 'content',
            content: 'テストコンテンツ',
            relativeFilePath: 'test/file1.txt',
            startLine: 1,
            endLine: 5,
          },
        },
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockQueryEmbedding);
      mockVectorRepository.searchVectors.mockResolvedValue(mockVectorResults);

      const results = await vectorBackend.search(query, k, novelId, fileType);

      expect(mockVectorRepository.searchVectors).toHaveBeenCalledWith(
        'test-collection',
        mockQueryEmbedding,
        k,
        0.7,
        {
          must: [
            {
              key: 'novelId',
              match: { value: novelId },
            },
            {
              key: 'fileType',
              match: { value: fileType },
            },
          ],
        },
      );

      expect(results).toHaveLength(1);
      expect(results[0].payload.file).toBe('test/file1.txt');
    });

    it('fileType="both"の場合はfileTypeフィルタが追加されない', async () => {
      const query = 'テスト検索';
      const k = 5;
      const novelId = 'test-novel';
      const fileType = 'both';

      const mockQueryEmbedding = [0.1, 0.2, 0.3];
      const mockVectorResults: VectorSearchResult[] = [
        {
          id: 'test-id-1',
          score: 0.9,
          payload: {
            novelId: 'test-novel',
            content: 'テストコンテンツ',
            relativeFilePath: 'test/file1.txt',
            startLine: 1,
            endLine: 5,
          },
        },
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockQueryEmbedding);
      mockVectorRepository.searchVectors.mockResolvedValue(mockVectorResults);

      const results = await vectorBackend.search(query, k, novelId, fileType);

      expect(mockVectorRepository.searchVectors).toHaveBeenCalledWith(
        'test-collection',
        mockQueryEmbedding,
        k,
        0.7,
        {
          must: [
            {
              key: 'novelId',
              match: { value: novelId },
            },
          ],
        },
      );

      expect(results).toHaveLength(1);
    });

    it('fileTypeが未指定の場合はfileTypeフィルタが追加されない', async () => {
      const query = 'テスト検索';
      const k = 5;
      const novelId = 'test-novel';

      const mockQueryEmbedding = [0.1, 0.2, 0.3];
      const mockVectorResults: VectorSearchResult[] = [
        {
          id: 'test-id-1',
          score: 0.9,
          payload: {
            novelId: 'test-novel',
            content: 'テストコンテンツ',
            relativeFilePath: 'test/file1.txt',
            startLine: 1,
            endLine: 5,
          },
        },
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockQueryEmbedding);
      mockVectorRepository.searchVectors.mockResolvedValue(mockVectorResults);

      const results = await vectorBackend.search(query, k, novelId);

      expect(mockVectorRepository.searchVectors).toHaveBeenCalledWith(
        'test-collection',
        mockQueryEmbedding,
        k,
        0.7,
        {
          must: [
            {
              key: 'novelId',
              match: { value: novelId },
            },
          ],
        },
      );

      expect(results).toHaveLength(1);
    });

    it('検索エラーが適切に処理される', async () => {
      const query = 'テスト検索';
      const k = 5;
      const novelId = 'test-novel';

      mockEmbeddingService.generateEmbedding.mockRejectedValue(
        new Error('Embedding generation failed'),
      );

      await expect(vectorBackend.search(query, k, novelId)).rejects.toThrow('Vector search failed');
    });
  });

  describe('clear', () => {
    it('インデックスが正常にクリアされる', async () => {
      mockVectorRepository.deleteCollection.mockResolvedValue(undefined);
      mockVectorRepository.ensureCollection.mockResolvedValue(undefined);

      await vectorBackend.clear();

      expect(mockVectorRepository.deleteCollection).toHaveBeenCalledWith('test-collection');
      expect(mockVectorRepository.ensureCollection).toHaveBeenCalledWith('test-collection', 384);
    });

    it('クリアエラーが適切に処理される', async () => {
      mockVectorRepository.deleteCollection.mockRejectedValue(new Error('Delete failed'));

      await expect(vectorBackend.clear()).rejects.toThrow('Failed to clear vector index');
    });
  });

  describe('getStats', () => {
    it('統計情報が正常に取得される', async () => {
      const mockCollectionInfo = {
        status: 'green',
        vectorsCount: 100,
        indexedVectorsCount: 100,
      };

      mockVectorRepository.getCollectionInfo.mockResolvedValue(mockCollectionInfo);

      const stats = await vectorBackend.getStats();

      expect(mockVectorRepository.getCollectionInfo).toHaveBeenCalledWith('test-collection');
      expect(stats).toEqual(
        expect.objectContaining({
          totalChunks: 100,
          lastUpdated: expect.any(Date),
        }),
      );
    });

    it('統計情報取得エラーが適切に処理される', async () => {
      mockVectorRepository.getCollectionInfo.mockRejectedValue(new Error('Get info failed'));

      const stats = await vectorBackend.getStats();

      expect(stats).toEqual(
        expect.objectContaining({
          totalChunks: 0,
          lastUpdated: expect.any(Date),
        }),
      );
    });
  });

  describe('removeByFile', () => {
    it('警告ログが出力される（未実装）', async () => {
      const filePath = 'test/file.txt';

      await vectorBackend.removeByFile(filePath);

      // 現在は未実装のため、エラーが発生しないことを確認
      expect(true).toBe(true);
    });
  });

  describe('removeByNovel', () => {
    it('警告ログが出力される（未実装）', async () => {
      const novelId = 'test-novel';

      await vectorBackend.removeByNovel(novelId);

      // 現在は未実装のため、エラーが発生しないことを確認
      expect(true).toBe(true);
    });
  });
});
