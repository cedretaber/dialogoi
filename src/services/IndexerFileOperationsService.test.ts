import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import { IndexerFileOperationsService } from './IndexerFileOperationsService.js';
import { NovelRepository } from '../repositories/NovelRepository.js';
import { IndexerManager } from '../lib/indexerManager.js';
import { NovelProject } from '../domain/novel.js';

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

const mockProject: NovelProject = {
  id: 'test-novel',
  path: '/test/path/test-novel',
  config: {
    title: 'テスト小説',
    author: 'テスト作者',
    settingsDirectories: ['settings'],
    contentDirectories: ['contents'],
  },
};

describe('IndexerFileOperationsService', () => {
  let fileOperationsService: IndexerFileOperationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    fileOperationsService = new IndexerFileOperationsService(
      mockNovelRepository,
      mockIndexerManager,
    );
  });

  describe('constructor', () => {
    it('NovelRepositoryとIndexerManagerを受け取って初期化される', () => {
      expect(fileOperationsService).toBeDefined();
    });

    it('IndexerManagerなしでも初期化できる', () => {
      const service = new IndexerFileOperationsService(mockNovelRepository);
      expect(service).toBeDefined();
    });
  });

  describe('setIndexerManager', () => {
    it('IndexerManagerを後から設定できる', () => {
      const service = new IndexerFileOperationsService(mockNovelRepository);
      service.setIndexerManager(mockIndexerManager);
      // 設定後の動作確認は他のテストで行う
    });
  });

  describe('createSettingsFile', () => {
    beforeEach(() => {
      vi.mocked(mockNovelRepository.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockNovelRepository.createSettingsFile).mockResolvedValue(undefined);
      vi.mocked(mockIndexerManager.updateFile).mockResolvedValue(undefined);
    });

    it('設定ファイルを作成できる', async () => {
      await fileOperationsService.createSettingsFile(
        'test-novel',
        'settings',
        'test.md',
        'テスト内容',
      );

      expect(mockNovelRepository.createSettingsFile).toHaveBeenCalledWith(
        'test-novel',
        'settings',
        'test.md',
        'テスト内容',
        false,
      );
      expect(mockNovelRepository.getProject).toHaveBeenCalledWith('test-novel');
      expect(mockIndexerManager.updateFile).toHaveBeenCalledWith(
        'test-novel',
        path.join('/test/path/test-novel', 'settings', 'test.md'),
      );
    });

    it('上書きオプションが渡される', async () => {
      await fileOperationsService.createSettingsFile(
        'test-novel',
        'settings',
        'test.md',
        'テスト内容',
        { overwrite: true },
      );

      expect(mockNovelRepository.createSettingsFile).toHaveBeenCalledWith(
        'test-novel',
        'settings',
        'test.md',
        'テスト内容',
        true,
      );
    });

    it('IndexerManagerが設定されていない場合でもファイルは作成される', async () => {
      const service = new IndexerFileOperationsService(mockNovelRepository);
      vi.mocked(mockNovelRepository.getProject).mockResolvedValue(mockProject);

      await service.createSettingsFile('test-novel', 'settings', 'test.md', 'テスト内容');

      expect(mockNovelRepository.createSettingsFile).toHaveBeenCalled();
      // IndexerManagerの更新は呼ばれない
      expect(mockIndexerManager.updateFile).not.toHaveBeenCalled();
    });

    it('IndexerManager更新でエラーが発生してもファイル作成は成功する', async () => {
      vi.mocked(mockIndexerManager.updateFile).mockRejectedValue(new Error('更新エラー'));

      // エラーが投げられないことを確認
      await expect(
        fileOperationsService.createSettingsFile('test-novel', 'settings', 'test.md', 'テスト内容'),
      ).resolves.toBeUndefined();

      expect(mockNovelRepository.createSettingsFile).toHaveBeenCalled();
    });
  });

  describe('createContentFile', () => {
    beforeEach(() => {
      vi.mocked(mockNovelRepository.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockNovelRepository.createContentFile).mockResolvedValue(undefined);
      vi.mocked(mockIndexerManager.updateFile).mockResolvedValue(undefined);
    });

    it('本文ファイルを作成できる', async () => {
      await fileOperationsService.createContentFile(
        'test-novel',
        'contents',
        'chapter1.txt',
        '第一章の内容',
      );

      expect(mockNovelRepository.createContentFile).toHaveBeenCalledWith(
        'test-novel',
        'contents',
        'chapter1.txt',
        '第一章の内容',
        false,
      );
      expect(mockNovelRepository.getProject).toHaveBeenCalledWith('test-novel');
      expect(mockIndexerManager.updateFile).toHaveBeenCalledWith(
        'test-novel',
        path.join('/test/path/test-novel', 'contents', 'chapter1.txt'),
      );
    });

    it('上書きオプションが渡される', async () => {
      await fileOperationsService.createContentFile(
        'test-novel',
        'contents',
        'chapter1.txt',
        '第一章の内容',
        { overwrite: true },
      );

      expect(mockNovelRepository.createContentFile).toHaveBeenCalledWith(
        'test-novel',
        'contents',
        'chapter1.txt',
        '第一章の内容',
        true,
      );
    });
  });

  describe('notifyFileUpdate', () => {
    it('ファイル更新をIndexerManagerに通知できる', async () => {
      vi.mocked(mockIndexerManager.updateFile).mockResolvedValue(undefined);

      await fileOperationsService.notifyFileUpdate('test-novel', '/test/path/file.md');

      expect(mockIndexerManager.updateFile).toHaveBeenCalledWith(
        'test-novel',
        '/test/path/file.md',
      );
    });

    it('IndexerManagerが設定されていない場合は通知をスキップする', async () => {
      const service = new IndexerFileOperationsService(mockNovelRepository);

      // エラーが投げられないことを確認
      await expect(
        service.notifyFileUpdate('test-novel', '/test/path/file.md'),
      ).resolves.toBeUndefined();
    });

    it('IndexerManager更新でエラーが発生してもメソッドは成功する', async () => {
      vi.mocked(mockIndexerManager.updateFile).mockRejectedValue(new Error('更新エラー'));

      // エラーが投げられないことを確認
      await expect(
        fileOperationsService.notifyFileUpdate('test-novel', '/test/path/file.md'),
      ).resolves.toBeUndefined();
    });
  });

  describe('統合テスト', () => {
    beforeEach(() => {
      vi.mocked(mockNovelRepository.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockNovelRepository.createSettingsFile).mockResolvedValue(undefined);
      vi.mocked(mockNovelRepository.createContentFile).mockResolvedValue(undefined);
      vi.mocked(mockIndexerManager.updateFile).mockResolvedValue(undefined);
    });

    it('設定ファイルと本文ファイルを連続して作成できる', async () => {
      // 設定ファイル作成
      await fileOperationsService.createSettingsFile(
        'test-novel',
        'settings',
        'character.md',
        'キャラクター設定',
      );

      // 本文ファイル作成
      await fileOperationsService.createContentFile(
        'test-novel',
        'contents',
        'prologue.txt',
        'プロローグの内容',
      );

      // 両方のファイル作成とインデックス更新が呼ばれることを確認
      expect(mockNovelRepository.createSettingsFile).toHaveBeenCalledTimes(1);
      expect(mockNovelRepository.createContentFile).toHaveBeenCalledTimes(1);
      expect(mockIndexerManager.updateFile).toHaveBeenCalledTimes(2);
    });

    it('Repository操作でエラーが発生した場合は適切に伝播される', async () => {
      vi.mocked(mockNovelRepository.createSettingsFile).mockRejectedValue(
        new Error('Repository エラー'),
      );

      await expect(
        fileOperationsService.createSettingsFile('test-novel', 'settings', 'test.md', 'テスト内容'),
      ).rejects.toThrow('Repository エラー');

      // インデックス更新は呼ばれない
      expect(mockIndexerManager.updateFile).not.toHaveBeenCalled();
    });
  });
});
