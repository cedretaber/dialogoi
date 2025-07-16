import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IndexerSearchService } from './IndexerSearchService.js';
import { NovelRepository } from '../repositories/NovelRepository.js';
import { IndexerManager } from '../lib/indexerManager.js';
import { ConfigurationError } from '../errors/index.js';

// モックの設定
const mockNovelRepository: NovelRepository = {
  listProjects: vi.fn(),
  getProject: vi.fn(),
  listSettingsFiles: vi.fn(),
  getSettingsContent: vi.fn(),
  searchSettingsFiles: vi.fn(),
  listContentFiles: vi.fn(),
  getContentFiles: vi.fn(),
  searchContentFiles: vi.fn(),
  listInstructionFiles: vi.fn(),
  getInstructionFiles: vi.fn(),
  createSettingsFile: vi.fn(),
  createContentFile: vi.fn(),
};

const mockIndexerManager = {
  search: vi.fn(),
  updateFile: vi.fn(),
  removeFile: vi.fn(),
  clearNovel: vi.fn(),
  rebuildNovel: vi.fn(),
  getInitializedNovels: vi.fn(),
  getStats: vi.fn(),
  cleanup: vi.fn(),
  startFileWatching: vi.fn(),
  stopFileWatching: vi.fn(),
  isFileWatching: vi.fn(),
} as Partial<IndexerManager> as IndexerManager;

describe('IndexerSearchService', () => {
  let searchService: IndexerSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    searchService = new IndexerSearchService(mockNovelRepository, mockIndexerManager);
  });

  describe('constructor', () => {
    it('NovelRepositoryとIndexerManagerを受け取って初期化される', () => {
      expect(searchService).toBeDefined();
    });

    it('IndexerManagerなしでも初期化できる', () => {
      const service = new IndexerSearchService(mockNovelRepository);
      expect(service).toBeDefined();
    });
  });

  describe('setIndexerManager', () => {
    it('IndexerManagerを後から設定できる', () => {
      const service = new IndexerSearchService(mockNovelRepository);
      service.setIndexerManager(mockIndexerManager);
      // 設定後の動作確認は他のテストで行う
    });
  });

  describe('searchRag', () => {
    it('RAG検索を実行できる', async () => {
      const mockResults = [
        {
          id: 'test-1',
          score: 0.9,
          snippet: 'テストスニペット',
          payload: { file: 'test.md', start: 1, end: 10 },
        },
      ];
      vi.mocked(mockIndexerManager.search).mockResolvedValue(mockResults);

      const results = await searchService.searchRag('test-novel', 'テストクエリ', { k: 5 });

      expect(mockIndexerManager.search).toHaveBeenCalledWith(
        'test-novel',
        'テストクエリ',
        5,
        undefined,
      );
      expect(results).toEqual(mockResults);
    });

    it('デフォルトのk値が使用される', async () => {
      vi.mocked(mockIndexerManager.search).mockResolvedValue([]);

      await searchService.searchRag('test-novel', 'テストクエリ');

      expect(mockIndexerManager.search).toHaveBeenCalledWith(
        'test-novel',
        'テストクエリ',
        10,
        undefined,
      );
    });

    it('IndexerManagerが設定されていない場合はエラーを投げる', async () => {
      const service = new IndexerSearchService(mockNovelRepository);

      await expect(service.searchRag('test-novel', 'テストクエリ')).rejects.toThrow(
        ConfigurationError,
      );
    });
  });

  describe('searchSettingsFiles', () => {
    it('設定ファイル検索を実行できる', async () => {
      const mockResults = [{ filename: 'test.md', matchingLines: ['マッチした行'] }];
      vi.mocked(mockNovelRepository.searchSettingsFiles).mockResolvedValue(mockResults);

      const results = await searchService.searchSettingsFiles('test-novel', 'キーワード');

      expect(mockNovelRepository.searchSettingsFiles).toHaveBeenCalledWith(
        'test-novel',
        'キーワード',
        false,
      );
      expect(results).toEqual(mockResults);
    });

    it('正規表現オプションが渡される', async () => {
      vi.mocked(mockNovelRepository.searchSettingsFiles).mockResolvedValue([]);

      await searchService.searchSettingsFiles('test-novel', 'パターン.*', { useRegex: true });

      expect(mockNovelRepository.searchSettingsFiles).toHaveBeenCalledWith(
        'test-novel',
        'パターン.*',
        true,
      );
    });
  });

  describe('searchContentFiles', () => {
    it('本文ファイル検索を実行できる', async () => {
      const mockResults = [{ filename: 'chapter1.md', matchingLines: ['マッチした行'] }];
      vi.mocked(mockNovelRepository.searchContentFiles).mockResolvedValue(mockResults);

      const results = await searchService.searchContentFiles('test-novel', 'キーワード');

      expect(mockNovelRepository.searchContentFiles).toHaveBeenCalledWith(
        'test-novel',
        'キーワード',
        false,
      );
      expect(results).toEqual(mockResults);
    });

    it('正規表現オプションが渡される', async () => {
      vi.mocked(mockNovelRepository.searchContentFiles).mockResolvedValue([]);

      await searchService.searchContentFiles('test-novel', 'パターン.*', { useRegex: true });

      expect(mockNovelRepository.searchContentFiles).toHaveBeenCalledWith(
        'test-novel',
        'パターン.*',
        true,
      );
    });
  });

  describe('startFileWatching', () => {
    it('ファイル監視を開始できる', async () => {
      vi.mocked(mockIndexerManager.startFileWatching).mockResolvedValue(undefined);

      await searchService.startFileWatching();

      expect(mockIndexerManager.startFileWatching).toHaveBeenCalled();
    });

    it('IndexerManagerが設定されていない場合はエラーを投げる', async () => {
      const service = new IndexerSearchService(mockNovelRepository);

      await expect(service.startFileWatching()).rejects.toThrow(ConfigurationError);
    });
  });

  describe('stopFileWatching', () => {
    it('ファイル監視を停止できる', async () => {
      vi.mocked(mockIndexerManager.stopFileWatching).mockResolvedValue(undefined);

      await searchService.stopFileWatching();

      expect(mockIndexerManager.stopFileWatching).toHaveBeenCalled();
    });

    it('IndexerManagerが設定されていない場合はエラーを投げる', async () => {
      const service = new IndexerSearchService(mockNovelRepository);

      await expect(service.stopFileWatching()).rejects.toThrow(ConfigurationError);
    });
  });

  describe('isFileWatching', () => {
    it('ファイル監視状態を取得できる', () => {
      vi.mocked(mockIndexerManager.isFileWatching).mockReturnValue(true);

      const result = searchService.isFileWatching();

      expect(mockIndexerManager.isFileWatching).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('IndexerManagerが設定されていない場合はfalseを返す', () => {
      const service = new IndexerSearchService(mockNovelRepository);

      const result = service.isFileWatching();

      expect(result).toBe(false);
    });
  });

  describe('統合テスト', () => {
    it('複数の操作を順番に実行できる', async () => {
      // ファイル監視開始
      vi.mocked(mockIndexerManager.startFileWatching).mockResolvedValue(undefined);
      vi.mocked(mockIndexerManager.isFileWatching).mockReturnValue(true);

      await searchService.startFileWatching();
      expect(searchService.isFileWatching()).toBe(true);

      // 検索実行
      const mockRagResults = [
        { id: 'test', score: 0.8, snippet: 'test', payload: { file: 'test.md', start: 1, end: 5 } },
      ];
      vi.mocked(mockIndexerManager.search).mockResolvedValue(mockRagResults);

      const ragResults = await searchService.searchRag('test-novel', 'クエリ');
      expect(ragResults).toEqual(mockRagResults);

      // ファイル監視停止
      vi.mocked(mockIndexerManager.stopFileWatching).mockResolvedValue(undefined);
      vi.mocked(mockIndexerManager.isFileWatching).mockReturnValue(false);

      await searchService.stopFileWatching();
      expect(searchService.isFileWatching()).toBe(false);
    });
  });
});
