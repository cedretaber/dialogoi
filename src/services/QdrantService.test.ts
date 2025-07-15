import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QdrantService, type QdrantConfig } from './QdrantService.js';
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

describe('QdrantService', () => {
  let service: QdrantService;
  let config: QdrantConfig;

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

    service = new QdrantService(config);
  });

  afterEach(async () => {
    await service.disconnect();
  });

  describe('constructor', () => {
    it('設定でQdrantサービスが初期化される', () => {
      expect(service.isConnectedToQdrant()).toBe(false);
    });

    it('APIキーなしで初期化される', () => {
      const configWithoutApiKey = { ...config, apiKey: undefined };
      const serviceWithoutApiKey = new QdrantService(configWithoutApiKey);
      expect(serviceWithoutApiKey.isConnectedToQdrant()).toBe(false);
    });
  });

  describe('connect', () => {
    it('Qdrantサーバーに正常に接続される', async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });

      await service.connect();

      expect(mockQdrantClient.versionInfo).toHaveBeenCalled();
      expect(service.isConnectedToQdrant()).toBe(true);
    });

    it('既に接続済みの場合は再接続を試行しない', async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });

      // 最初の接続
      await service.connect();
      expect(mockQdrantClient.versionInfo).toHaveBeenCalledTimes(1);

      // 2回目の呼び出し
      await service.connect();
      expect(mockQdrantClient.versionInfo).toHaveBeenCalledTimes(1); // 増えない
    });

    it('接続エラーが適切に処理される', async () => {
      mockQdrantClient.versionInfo.mockRejectedValue(new Error('Connection failed'));

      await expect(service.connect()).rejects.toThrow('Failed to connect to Qdrant');
      expect(service.isConnectedToQdrant()).toBe(false);
    });
  });

  describe('ensureCollection', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await service.connect();
    });

    it('新しいコレクションが作成される', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [],
      });
      mockQdrantClient.createCollection.mockResolvedValue({});

      await service.ensureCollection('test-collection', 384);

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

      await service.ensureCollection('test-collection', 384);

      expect(mockQdrantClient.getCollections).toHaveBeenCalled();
      expect(mockQdrantClient.createCollection).not.toHaveBeenCalled();
    });

    it('コレクション作成エラーが適切に処理される', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [],
      });
      mockQdrantClient.createCollection.mockRejectedValue(new Error('Creation failed'));

      await expect(service.ensureCollection('test-collection', 384)).rejects.toThrow(
        'Failed to ensure collection',
      );
    });
  });

  describe('upsertPoints', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await service.connect();
    });

    it('ポイントが正常にアップサートされる', async () => {
      const points: Schemas['PointStruct'][] = [
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

      await service.upsertPoints('test-collection', points);

      expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test-collection', {
        wait: true,
        points,
      });
    });

    it('空の配列の場合は処理をスキップする', async () => {
      await service.upsertPoints('test-collection', []);

      expect(mockQdrantClient.upsert).not.toHaveBeenCalled();
    });

    it('アップサートエラーが適切に処理される', async () => {
      const points: Schemas['PointStruct'][] = [
        {
          id: 'point1',
          vector: [0.1, 0.2, 0.3],
          payload: { text: 'テストテキスト' },
        },
      ];

      mockQdrantClient.upsert.mockRejectedValue(new Error('Upsert failed'));

      await expect(service.upsertPoints('test-collection', points)).rejects.toThrow(
        'Failed to upsert',
      );
    });
  });

  describe('searchPoints', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await service.connect();
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

      const vector = [0.1, 0.2, 0.3];
      const results = await service.searchPoints('test-collection', vector, 10);

      expect(mockQdrantClient.search).toHaveBeenCalledWith('test-collection', {
        vector,
        limit: 10,
        score_threshold: undefined,
        with_payload: true,
      });
      expect(results).toEqual(mockResults);
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

      const vector = [0.1, 0.2, 0.3];
      const results = await service.searchPoints('test-collection', vector, 10, 0.8);

      expect(mockQdrantClient.search).toHaveBeenCalledWith('test-collection', {
        vector,
        limit: 10,
        score_threshold: 0.8,
        with_payload: true,
      });
      expect(results).toEqual(mockResults);
    });

    it('検索エラーが適切に処理される', async () => {
      mockQdrantClient.search.mockRejectedValue(new Error('Search failed'));

      const vector = [0.1, 0.2, 0.3];
      await expect(service.searchPoints('test-collection', vector, 10)).rejects.toThrow(
        'Failed to search',
      );
    });
  });

  describe('deletePoints', () => {
    beforeEach(async () => {
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await service.connect();
    });

    it('ポイントが正常に削除される', async () => {
      const pointIds = ['point1', 'point2', 'point3'];
      mockQdrantClient.delete.mockResolvedValue({});

      await service.deletePoints('test-collection', pointIds);

      expect(mockQdrantClient.delete).toHaveBeenCalledWith('test-collection', {
        wait: true,
        points: pointIds,
      });
    });

    it('空の配列の場合は処理をスキップする', async () => {
      await service.deletePoints('test-collection', []);

      expect(mockQdrantClient.delete).not.toHaveBeenCalled();
    });

    it('削除エラーが適切に処理される', async () => {
      const pointIds = ['point1'];
      mockQdrantClient.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(service.deletePoints('test-collection', pointIds)).rejects.toThrow(
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
      await service.connect();
    });

    it('コレクションが正常に削除される', async () => {
      mockQdrantClient.deleteCollection.mockResolvedValue({});

      await service.deleteCollection('test-collection');

      expect(mockQdrantClient.deleteCollection).toHaveBeenCalledWith('test-collection');
    });

    it('コレクション削除エラーが適切に処理される', async () => {
      mockQdrantClient.deleteCollection.mockRejectedValue(new Error('Delete collection failed'));

      await expect(service.deleteCollection('test-collection')).rejects.toThrow(
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
      await service.connect();
    });

    it('コレクション情報が正常に取得される', async () => {
      const mockInfo = {
        status: 'green',
        vectors_count: 100,
        indexed_vectors_count: 100,
      };

      mockQdrantClient.getCollection.mockResolvedValue(mockInfo);

      const info = await service.getCollectionInfo('test-collection');

      expect(mockQdrantClient.getCollection).toHaveBeenCalledWith('test-collection');
      expect(info).toEqual(mockInfo);
    });

    it('コレクション情報取得エラーが適切に処理される', async () => {
      mockQdrantClient.getCollection.mockRejectedValue(new Error('Get collection failed'));

      await expect(service.getCollectionInfo('test-collection')).rejects.toThrow(
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
      await service.connect();
      expect(service.isConnectedToQdrant()).toBe(true);

      await service.disconnect();
      expect(service.isConnectedToQdrant()).toBe(false);
    });

    it('未接続状態でも安全に実行される', async () => {
      expect(service.isConnectedToQdrant()).toBe(false);
      await expect(service.disconnect()).resolves.not.toThrow();
    });
  });

  describe('統合テスト', () => {
    it('コレクション作成からポイント操作まで一連の流れが実行される', async () => {
      // 接続
      mockQdrantClient.versionInfo.mockResolvedValue({
        title: 'qdrant',
        version: '1.0.0',
      });
      await service.connect();

      // コレクション作成
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });
      mockQdrantClient.createCollection.mockResolvedValue({});
      await service.ensureCollection('integration-test', 384);

      // ポイント挿入
      const points: Schemas['PointStruct'][] = [
        {
          id: 'test-point',
          vector: [0.1, 0.2, 0.3],
          payload: { text: 'テストテキスト' },
        },
      ];
      mockQdrantClient.upsert.mockResolvedValue({});
      await service.upsertPoints('integration-test', points);

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
      const results = await service.searchPoints('integration-test', [0.1, 0.2, 0.3], 5);

      // ポイント削除
      mockQdrantClient.delete.mockResolvedValue({});
      await service.deletePoints('integration-test', ['test-point']);

      // 検証
      expect(mockQdrantClient.createCollection).toHaveBeenCalled();
      expect(mockQdrantClient.upsert).toHaveBeenCalled();
      expect(mockQdrantClient.search).toHaveBeenCalled();
      expect(mockQdrantClient.delete).toHaveBeenCalled();
      expect(results).toEqual(mockResults);
    });
  });
});
