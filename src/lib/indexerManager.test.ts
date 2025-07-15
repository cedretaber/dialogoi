import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexerManager } from './indexerManager.js';
import { DialogoiConfig } from './config.js';
import { Indexer } from '../indexer.js';

// Indexerをモック化
vi.mock('../indexer.js');

describe('IndexerManager', () => {
  let indexerManager: IndexerManager;
  let mockConfig: DialogoiConfig;
  let mockIndexer: {
    indexNovel: ReturnType<typeof vi.fn>;
    removeNovelFromIndex: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    updateFile: ReturnType<typeof vi.fn>;
    removeFile: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
    isReady: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      projectRoot: '/test/novels',
      chunk: {
        maxTokens: 400,
        overlap: 0.2,
      },
      embedding: {
        enabled: true,
        model: 'intfloat/multilingual-e5-small',
        dimensions: 384,
        batchSize: 32,
      },
      qdrant: {
        url: 'http://localhost:6333',
        collection: 'test-collection',
        timeout: 5000,
      },
      vector: {
        collectionName: 'test-collection',
        scoreThreshold: 0.7,
        vectorDimensions: 384,
        snippetLength: 120,
      },
      search: {
        defaultK: 10,
        maxK: 50,
      },
    };

    mockIndexer = {
      indexNovel: vi.fn(),
      removeNovelFromIndex: vi.fn(),
      search: vi.fn().mockResolvedValue([]),
      updateFile: vi.fn(),
      removeFile: vi.fn(),
      cleanup: vi.fn(),
      isReady: vi.fn().mockReturnValue(true),
    };

    vi.mocked(Indexer).mockImplementation(() => mockIndexer as unknown as Indexer);

    indexerManager = new IndexerManager(mockConfig);
  });

  afterEach(async () => {
    await indexerManager.cleanup();
  });

  describe('小説初期化管理', () => {
    it('初期化済みノベルをトラッキングできる', async () => {
      expect(indexerManager.hasInitialized('novel-1')).toBe(false);

      await indexerManager.search('novel-1', 'test query', 10);

      expect(mockIndexer.indexNovel).toHaveBeenCalledWith('novel-1');
      expect(indexerManager.hasInitialized('novel-1')).toBe(true);
    });

    it('初期化済みノベルは再初期化されない', async () => {
      await indexerManager.search('novel-1', 'test query', 10);
      await indexerManager.search('novel-1', 'another query', 10);

      expect(mockIndexer.indexNovel).toHaveBeenCalledTimes(1);
      expect(mockIndexer.indexNovel).toHaveBeenCalledWith('novel-1');
    });

    it('異なるノベルは別々に初期化される', async () => {
      await indexerManager.search('novel-1', 'test query', 10);
      await indexerManager.search('novel-2', 'test query', 10);

      expect(mockIndexer.indexNovel).toHaveBeenCalledTimes(2);
      expect(mockIndexer.indexNovel).toHaveBeenCalledWith('novel-1');
      expect(mockIndexer.indexNovel).toHaveBeenCalledWith('novel-2');
    });
  });

  describe('検索操作', () => {
    it('検索を実行できる', async () => {
      const mockResults = [
        {
          id: 'chunk-1',
          score: 0.9,
          snippet: 'Test content',
          payload: {
            file: 'test.md',
            start: 1,
            end: 5,
          },
        },
      ];

      mockIndexer.search.mockResolvedValue(mockResults);

      const results = await indexerManager.search('novel-1', 'test query', 10);

      expect(mockIndexer.indexNovel).toHaveBeenCalledWith('novel-1');
      expect(mockIndexer.search).toHaveBeenCalledWith('test query', 10, 'novel-1');
      expect(results).toEqual(mockResults);
    });

    it('ファイル更新を実行できる', async () => {
      await indexerManager.updateFile('novel-1', 'test.md');

      // 未初期化の小説は初期化のみ行い、個別のupdateFileは呼び出さない
      expect(mockIndexer.indexNovel).toHaveBeenCalledWith('novel-1');
      expect(mockIndexer.updateFile).not.toHaveBeenCalled();
    });

    it('既に初期化済みの小説に対してファイル更新を実行できる', async () => {
      // 先に初期化を実行
      await indexerManager.updateFile('novel-1', 'initial.md');

      // モックをリセット
      vi.clearAllMocks();

      // 既に初期化済みの小説に対してファイル更新を実行
      await indexerManager.updateFile('novel-1', 'test.md');

      // 初期化は呼び出されず、updateFileのみ呼び出される
      expect(mockIndexer.indexNovel).not.toHaveBeenCalled();
      expect(mockIndexer.updateFile).toHaveBeenCalledWith('test.md', 'novel-1');
    });

    it('ファイル削除を実行できる', async () => {
      await indexerManager.removeFile('novel-1', 'test.md');

      expect(mockIndexer.indexNovel).toHaveBeenCalledWith('novel-1');
      expect(mockIndexer.removeFile).toHaveBeenCalledWith('test.md');
    });

    it('インデックス再構築を実行できる', async () => {
      // 最初に初期化して、再構築をテスト
      await indexerManager.search('novel-1', 'test', 10);
      await indexerManager.rebuildIndex('novel-1');

      expect(mockIndexer.removeNovelFromIndex).toHaveBeenCalledWith('novel-1');
      expect(mockIndexer.indexNovel).toHaveBeenCalledTimes(2); // 初期化 + 再構築
    });
  });

  describe('インデックス管理', () => {
    it('ノベルインデックスをクリアできる', async () => {
      await indexerManager.search('novel-1', 'test', 10);
      expect(indexerManager.hasInitialized('novel-1')).toBe(true);

      await indexerManager.clearNovelIndex('novel-1');

      expect(mockIndexer.removeNovelFromIndex).toHaveBeenCalledWith('novel-1');
      expect(indexerManager.hasInitialized('novel-1')).toBe(false);
    });

    it('未初期化のノベルをクリアしても問題ない', async () => {
      await indexerManager.clearNovelIndex('novel-1');

      expect(mockIndexer.removeNovelFromIndex).not.toHaveBeenCalled();
      expect(indexerManager.hasInitialized('novel-1')).toBe(false);
    });
  });

  describe('統計情報', () => {
    it('初期化済みノベル一覧を取得できる', async () => {
      await indexerManager.search('novel-1', 'test', 10);
      await indexerManager.search('novel-2', 'test', 10);

      const novels = indexerManager.getInitializedNovels();

      expect(novels).toEqual(['novel-1', 'novel-2']);
    });

    it('統計情報を取得できる', async () => {
      await indexerManager.search('novel-1', 'test', 10);
      await indexerManager.search('novel-2', 'test', 10);

      const stats = indexerManager.getStats();

      expect(stats.totalInitializedNovels).toBe(2);
      expect(stats.novels).toEqual([
        { novelId: 'novel-1', isInitialized: true },
        { novelId: 'novel-2', isInitialized: true },
      ]);
    });
  });

  describe('クリーンアップ', () => {
    it('全てのインデックスをクリーンアップできる', async () => {
      await indexerManager.search('novel-1', 'test', 10);
      await indexerManager.search('novel-2', 'test', 10);

      expect(indexerManager.getInitializedNovels()).toEqual(['novel-1', 'novel-2']);

      await indexerManager.cleanup();

      expect(mockIndexer.cleanup).toHaveBeenCalled();
      expect(indexerManager.getInitializedNovels()).toEqual([]);
    });
  });
});
