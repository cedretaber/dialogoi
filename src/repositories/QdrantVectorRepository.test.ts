import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QdrantVectorRepository, type VectorRepositoryConfig } from './QdrantVectorRepository.js';
import type { VectorPoint } from './VectorRepository.js';
import type { Schemas } from '@qdrant/js-client-rest';

// QdrantClientのモック
const mockQdrantClient = {
  versionInfo: vi.fn(),
  getCollections: vi.fn(),
  createCollection: vi.fn(),
  upsert: vi.fn(),
  search: vi.fn(),
  delete: vi.fn(),
  deleteCollection: vi.fn(),
  getCollection: vi.fn(),
};

// モジュールのモック
vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn(() => mockQdrantClient),
}));

describe('QdrantVectorRepository', () => {
  let repository: QdrantVectorRepository;
  let config: VectorRepositoryConfig;

  beforeEach(() => {
    // モックのリセット
    vi.resetAllMocks();

    // テスト用設定
    config = {
      url: 'http://localhost:6333',
      apiKey: 'test-api-key',
      timeout: 5000,
      defaultCollection: 'test-collection',
    };

    repository = new QdrantVectorRepository(config);
  });

  afterEach(async () => {
    await repository.disconnect();
  });

  describe('constructor', () => {
    it('設定でQdrantリポジトリが初期化される', () => {
      expect(repository.isConnected()).toBe(false);
    });

    it('APIキーなしで初期化される', () => {
      const configWithoutApiKey = { ...config, apiKey: undefined };
      const repositoryWithoutApiKey = new QdrantVectorRepository(configWithoutApiKey);
      expect(repositoryWithoutApiKey.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('Qdrantサーバーに正常に接続される', async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });

      await repository.connect();

      expect(mockQdrantClient.versionInfo).toHaveBeenCalled();
      expect(repository.isConnected()).toBe(true);
    });

    it('既に接続済みの場合は再接続を試行しない', async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });

      // 最初の接続
      await repository.connect();
      expect(mockQdrantClient.versionInfo).toHaveBeenCalledTimes(1);

      // 2回目の呼び出し
      await repository.connect();
      expect(mockQdrantClient.versionInfo).toHaveBeenCalledTimes(1); // 増えない
    });

    it('接続エラーが適切に処理される', async () => {
      mockQdrantClient.versionInfo.mockRejectedValue(new Error('Connection failed'));

      await expect(repository.connect()).rejects.toThrow('Failed to connect to Qdrant');
      expect(repository.isConnected()).toBe(false);
    });
  });

  describe('ensureCollection', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await repository.connect();
    });

    it('新しいコレクションが作成される', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [],
      });
      mockQdrantClient.createCollection.mockResolvedValue({});

      await repository.ensureCollection('test-collection', 384);

      expect(mockQdrantClient.getCollections).toHaveBeenCalled();
      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('test-collection', {
        vectors: {
          size: 384,
          distance: 'Cosine',
        },
      });
    });

    it('既存のコレクションの場合は作成をスキップする', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [{ name: 'test-collection' }],
      });

      await repository.ensureCollection('test-collection', 384);

      expect(mockQdrantClient.getCollections).toHaveBeenCalled();
      expect(mockQdrantClient.createCollection).not.toHaveBeenCalled();
    });

    it('コレクション作成エラーが適切に処理される', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [],
      });
      mockQdrantClient.createCollection.mockRejectedValue(new Error('Creation failed'));

      await expect(repository.ensureCollection('test-collection', 384)).rejects.toThrow(
        'Failed to ensure collection',
      );
    });
  });

  describe('upsertVectors', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await repository.connect();
    });

    it('ベクトルが正常にアップサートされる', async () => {
      const vectors: VectorPoint[] = [
        {
          id: 'point1',
          vector: [0.1, 0.2, 0.3],
          payload: { text: 'テストテキスト1' },
        },
        {
          id: 'point2',
          vector: [0.4, 0.5, 0.6],
          payload: { text: 'テストテキスト2' },
        },
      ];

      mockQdrantClient.upsert.mockResolvedValue({});

      await repository.upsertVectors('test-collection', vectors);

      expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test-collection', {
        wait: true,
        points: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            vector: [0.1, 0.2, 0.3],
            payload: expect.objectContaining({
              text: 'テストテキスト1',
              originalId: 'point1',
            }),
          }),
          expect.objectContaining({
            id: expect.any(String),
            vector: [0.4, 0.5, 0.6],
            payload: expect.objectContaining({
              text: 'テストテキスト2',
              originalId: 'point2',
            }),
          }),
        ]),
      });
    });

    it('空の配列の場合は処理をスキップする', async () => {
      await repository.upsertVectors('test-collection', []);

      expect(mockQdrantClient.upsert).not.toHaveBeenCalled();
    });

    it('アップサートエラーが適切に処理される', async () => {
      const vectors: VectorPoint[] = [
        {
          id: 'point1',
          vector: [0.1, 0.2, 0.3],
          payload: { text: 'テストテキスト' },
        },
      ];

      mockQdrantClient.upsert.mockRejectedValue(new Error('Upsert failed'));

      await expect(repository.upsertVectors('test-collection', vectors)).rejects.toThrow(
        'Failed to upsert',
      );
    });
  });

  describe('searchVectors', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await repository.connect();
    });

    it('ベクトル検索が正常に実行される', async () => {
      const mockResults: Schemas['ScoredPoint'][] = [
        {
          id: 'point1',
          version: 1,
          score: 0.95,
          payload: { text: 'マッチしたテキスト1' },
        },
        {
          id: 'point2',
          version: 1,
          score: 0.87,
          payload: { text: 'マッチしたテキスト2' },
        },
      ];

      mockQdrantClient.search.mockResolvedValue(mockResults);

      const queryVector = [0.1, 0.2, 0.3];
      const results = await repository.searchVectors('test-collection', queryVector, 10);

      expect(mockQdrantClient.search).toHaveBeenCalledWith('test-collection', {
        vector: queryVector,
        limit: 10,
        score_threshold: undefined,
        with_payload: true,
      });
      expect(results).toEqual([
        {
          id: 'point1',
          score: 0.95,
          payload: { text: 'マッチしたテキスト1' },
          vector: undefined,
        },
        {
          id: 'point2',
          score: 0.87,
          payload: { text: 'マッチしたテキスト2' },
          vector: undefined,
        },
      ]);
    });

    it('スコア閾値付きで検索が実行される', async () => {
      const mockResults: Schemas['ScoredPoint'][] = [
        {
          id: 'point1',
          version: 1,
          score: 0.95,
          payload: { text: 'マッチしたテキスト' },
        },
      ];

      mockQdrantClient.search.mockResolvedValue(mockResults);

      const queryVector = [0.1, 0.2, 0.3];
      const results = await repository.searchVectors('test-collection', queryVector, 10, 0.8);

      expect(mockQdrantClient.search).toHaveBeenCalledWith('test-collection', {
        vector: queryVector,
        limit: 10,
        score_threshold: 0.8,
        with_payload: true,
      });
      expect(results).toEqual([
        {
          id: 'point1',
          score: 0.95,
          payload: { text: 'マッチしたテキスト' },
          vector: undefined,
        },
      ]);
    });

    it('検索エラーが適切に処理される', async () => {
      mockQdrantClient.search.mockRejectedValue(new Error('Search failed'));

      const queryVector = [0.1, 0.2, 0.3];
      await expect(repository.searchVectors('test-collection', queryVector, 10)).rejects.toThrow(
        'Failed to search',
      );
    });
  });

  describe('deleteVectors', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await repository.connect();
    });

    it('ベクトルが正常に削除される', async () => {
      const vectorIds = ['point1', 'point2', 'point3'];
      mockQdrantClient.delete.mockResolvedValue({});

      await repository.deleteVectors('test-collection', vectorIds);

      expect(mockQdrantClient.delete).toHaveBeenCalledWith('test-collection', {
        wait: true,
        points: expect.any(Array),
      });
    });

    it('空の配列の場合は処理をスキップする', async () => {
      await repository.deleteVectors('test-collection', []);

      expect(mockQdrantClient.delete).not.toHaveBeenCalled();
    });

    it('削除エラーが適切に処理される', async () => {
      const vectorIds = ['point1'];
      mockQdrantClient.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(repository.deleteVectors('test-collection', vectorIds)).rejects.toThrow(
        'Failed to delete',
      );
    });
  });

  describe('deleteCollection', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await repository.connect();
    });

    it('コレクションが正常に削除される', async () => {
      mockQdrantClient.deleteCollection.mockResolvedValue({});

      await repository.deleteCollection('test-collection');

      expect(mockQdrantClient.deleteCollection).toHaveBeenCalledWith('test-collection');
    });

    it('コレクション削除エラーが適切に処理される', async () => {
      mockQdrantClient.deleteCollection.mockRejectedValue(new Error('Delete collection failed'));

      await expect(repository.deleteCollection('test-collection')).rejects.toThrow(
        'Failed to delete collection',
      );
    });
  });

  describe('getCollectionInfo', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await repository.connect();
    });

    it('コレクション情報が正常に取得される', async () => {
      const mockInfo = {
        status: 'green',
        vectors_count: 100,
        indexed_vectors_count: 100,
      };

      mockQdrantClient.getCollection.mockResolvedValue(mockInfo);

      const info = await repository.getCollectionInfo('test-collection');

      expect(mockQdrantClient.getCollection).toHaveBeenCalledWith('test-collection');
      expect(info).toEqual({
        status: 'green',
        vectorsCount: 100,
        indexedVectorsCount: 100,
        vectors_count: 100,
        indexed_vectors_count: 100,
      });
    });

    it('コレクション情報取得エラーが適切に処理される', async () => {
      mockQdrantClient.getCollection.mockRejectedValue(new Error('Get collection failed'));

      await expect(repository.getCollectionInfo('test-collection')).rejects.toThrow(
        'Failed to get collection info',
      );
    });
  });

  describe('disconnect', () => {
    it('接続が正常に切断される', async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await repository.connect();
      expect(repository.isConnected()).toBe(true);

      await repository.disconnect();
      expect(repository.isConnected()).toBe(false);
    });

    it('未接続状態でも安全に実行される', async () => {
      expect(repository.isConnected()).toBe(false);
      await expect(repository.disconnect()).resolves.not.toThrow();
    });
  });

  describe('統合テスト', () => {
    it('コレクション作成からベクトル操作まで一連の流れが実行される', async () => {
      // 接続
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await repository.connect();

      // コレクション作成
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });
      mockQdrantClient.createCollection.mockResolvedValue({});
      await repository.ensureCollection('integration-test', 384);

      // ベクトル挿入
      const vectors: VectorPoint[] = [
        {
          id: 'test-point',
          vector: [0.1, 0.2, 0.3],
          payload: { text: 'テストテキスト' },
        },
      ];
      mockQdrantClient.upsert.mockResolvedValue({});
      await repository.upsertVectors('integration-test', vectors);

      // 検索
      const mockResults: Schemas['ScoredPoint'][] = [
        {
          id: 'test-point',
          version: 1,
          score: 0.95,
          payload: { text: 'テストテキスト' },
        },
      ];
      mockQdrantClient.search.mockResolvedValue(mockResults);
      const results = await repository.searchVectors('integration-test', [0.1, 0.2, 0.3], 5);

      // ベクトル削除
      mockQdrantClient.delete.mockResolvedValue({});
      await repository.deleteVectors('integration-test', ['test-point']);

      // 検証
      expect(mockQdrantClient.createCollection).toHaveBeenCalled();
      expect(mockQdrantClient.upsert).toHaveBeenCalled();
      expect(mockQdrantClient.search).toHaveBeenCalled();
      expect(mockQdrantClient.delete).toHaveBeenCalled();
      expect(results).toEqual([
        {
          id: 'test-point',
          score: 0.95,
          payload: { text: 'テストテキスト' },
          vector: undefined,
        },
      ]);
    });
  });
});
