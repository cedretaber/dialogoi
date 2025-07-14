import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexerManager } from './indexerManager.js';
import { DialogoiConfig } from './config.js';
import { Indexer } from '../indexer.js';

// Indexerをモック化
vi.mock('../indexer.js');

describe('IndexerManager', () => {
  let indexerManager: IndexerManager;
  let mockConfig: DialogoiConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      vector: 'none',
      projectRoot: '/test/novels',
      chunk: {
        maxTokens: 400,
        overlap: 0.2,
      },
      flex: {
        profile: 'match',
      },
      search: {
        defaultK: 10,
        maxK: 50,
      },
    };

    indexerManager = new IndexerManager(mockConfig);
  });

  afterEach(async () => {
    await indexerManager.cleanup();
  });

  describe('Indexer管理', () => {
    it('新しいIndexerを作成できる', async () => {
      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      const novelId = 'test-novel';
      const indexer = await indexerManager.getOrCreateIndexer(novelId);

      expect(Indexer).toHaveBeenCalledWith(mockConfig, novelId);
      expect(mockIndexer.initialize).toHaveBeenCalled();
      expect(indexer).toBe(mockIndexer);
    });

    it('既存のIndexerを再利用する', async () => {
      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      const novelId = 'test-novel';
      const indexer1 = await indexerManager.getOrCreateIndexer(novelId);
      const indexer2 = await indexerManager.getOrCreateIndexer(novelId);

      expect(Indexer).toHaveBeenCalledTimes(1);
      expect(mockIndexer.initialize).toHaveBeenCalledTimes(1);
      expect(indexer1).toBe(indexer2);
    });

    it('Indexerの存在確認ができる', async () => {
      const novelId = 'test-novel';

      expect(indexerManager.hasIndexer(novelId)).toBe(false);

      await indexerManager.getOrCreateIndexer(novelId);

      expect(indexerManager.hasIndexer(novelId)).toBe(true);
    });

    it('Indexerを削除できる', async () => {
      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      const novelId = 'test-novel';
      await indexerManager.getOrCreateIndexer(novelId);

      expect(indexerManager.hasIndexer(novelId)).toBe(true);

      await indexerManager.removeIndexer(novelId);

      expect(mockIndexer.cleanup).toHaveBeenCalled();
      expect(indexerManager.hasIndexer(novelId)).toBe(false);
    });
  });

  describe('検索操作', () => {
    it('検索を実行できる', async () => {
      const mockResults = [
        {
          id: 'test-chunk-1',
          score: 0.95,
          snippet: 'Test content',
          payload: {
            file: 'test.md',
            start: 1,
            end: 5,
            tags: ['test'],
          },
        },
      ];

      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue(mockResults),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      const novelId = 'test-novel';
      const query = 'test query';
      const k = 10;

      const results = await indexerManager.search(novelId, query, k);

      expect(mockIndexer.search).toHaveBeenCalledWith(query, k, novelId);
      expect(results).toEqual(mockResults);
    });

    it('ファイル更新を実行できる', async () => {
      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      const novelId = 'test-novel';
      const filePath = '/test/path/file.md';

      await indexerManager.updateFile(novelId, filePath);

      expect(mockIndexer.updateFile).toHaveBeenCalledWith(filePath);
    });

    it('ファイル削除を実行できる', async () => {
      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      const novelId = 'test-novel';
      const filePath = '/test/path/file.md';

      await indexerManager.removeFile(novelId, filePath);

      expect(mockIndexer.removeFile).toHaveBeenCalledWith(filePath);
    });

    it('インデックス再構築を実行できる', async () => {
      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      const novelId = 'test-novel';

      await indexerManager.rebuildIndex(novelId);

      expect(mockIndexer.buildFullIndex).toHaveBeenCalled();
    });
  });

  describe('統計情報', () => {
    it('Indexer一覧を取得できる', async () => {
      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      await indexerManager.getOrCreateIndexer('novel-1');
      await indexerManager.getOrCreateIndexer('novel-2');

      const list = indexerManager.getIndexerList();
      expect(list).toEqual(['novel-1', 'novel-2']);
    });

    it('統計情報を取得できる', async () => {
      const mockIndexer = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

      await indexerManager.getOrCreateIndexer('novel-1');
      await indexerManager.getOrCreateIndexer('novel-2');

      const stats = indexerManager.getStats();
      expect(stats.totalIndexers).toBe(2);
      expect(stats.indexers).toEqual([
        { novelId: 'novel-1', isReady: true },
        { novelId: 'novel-2', isReady: true },
      ]);
    });
  });

  describe('クリーンアップ', () => {
    it('全てのIndexerをクリーンアップできる', async () => {
      const mockIndexer1 = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      const mockIndexer2 = {
        initialize: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        updateFile: vi.fn(),
        removeFile: vi.fn(),
        buildFullIndex: vi.fn(),
        cleanup: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
      };

      vi.mocked(Indexer)
        .mockImplementationOnce(() => mockIndexer1 as unknown as Indexer)
        .mockImplementationOnce(() => mockIndexer2 as unknown as Indexer);

      await indexerManager.getOrCreateIndexer('novel-1');
      await indexerManager.getOrCreateIndexer('novel-2');

      await indexerManager.cleanup();

      expect(mockIndexer1.cleanup).toHaveBeenCalled();
      expect(mockIndexer2.cleanup).toHaveBeenCalled();
      expect(indexerManager.getIndexerList()).toEqual([]);
    });
  });
});
