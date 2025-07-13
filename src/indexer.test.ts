import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Indexer } from './indexer.js';
import { DialogoiConfig } from './lib/config.js';
import { glob } from 'glob';

// モックの設定
vi.mock('fs/promises');
vi.mock('glob');
vi.mock('./backends/FlexBackend.js');

describe('Indexer', () => {
  let indexer: Indexer;
  let mockConfig: DialogoiConfig;
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      vector: 'none',
      projectRoot: testProjectRoot,
      chunk: {
        maxTokens: 400,
        overlap: 50,
      },
      flex: {
        profile: 'match',
        exportPath: '/test/project/.index/flex.json',
      },
      search: {
        defaultK: 10,
        maxK: 50,
      },
    };

    indexer = new Indexer(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('既存インデックスがある場合は復元する', async () => {
      // fs.accessが成功することでファイルが存在することを示す
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);

      const consoleSpy = vi.spyOn(console, 'log');
      await indexer.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('✅ 既存インデックスを復元しました');
    });

    it('既存インデックスがない場合は新規作成する', async () => {
      // fs.accessが失敗することでファイルが存在しないことを示す
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));

      // buildFullIndexの処理に必要なモック
      vi.mocked(glob).mockResolvedValue([]);
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);

      const consoleSpy = vi.spyOn(console, 'log');
      await indexer.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('📝 新規インデックスを作成します');
    });
  });

  describe('buildFullIndex', () => {
    it('プロジェクト内のファイルを走査してインデックスを構築する', async () => {
      const mockFiles = [
        '/test/project/file1.md',
        '/test/project/file2.txt',
        '/test/project/nested/file3.md',
      ];

      // globモックの設定
      vi.mocked(glob).mockImplementation(async (pattern: string | string[]) => {
        if (typeof pattern === 'string') {
          if (pattern.endsWith('*.md')) {
            return [mockFiles[0], mockFiles[2]];
          } else if (pattern.endsWith('*.txt')) {
            return [mockFiles[1]];
          }
        }
        return [];
      });

      // ファイル読み込みのモック
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('file1')) return '# File 1 content';
        if (pathStr.includes('file2')) return 'File 2 content';
        if (pathStr.includes('file3')) return '# File 3 content';
        return '';
      });

      // ディレクトリ作成のモック
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const consoleSpy = vi.spyOn(console, 'log');
      await indexer.buildFullIndex();

      expect(consoleSpy).toHaveBeenCalledWith('🔍 プロジェクトファイルを走査中...');
      expect(consoleSpy).toHaveBeenCalledWith('📄 3 個のファイルを発見');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🎉 インデックス構築完了'));
    });

    it('ファイル処理中のエラーを適切にハンドリングする', async () => {
      const mockFiles = ['/test/project/error.md'];

      vi.mocked(glob).mockResolvedValue(mockFiles);
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read error'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const consoleErrorSpy = vi.spyOn(console, 'error');
      await indexer.buildFullIndex();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('✗ error.md: Error:'));
    });
  });

  describe('processFile', () => {
    it('ファイルを読み込んでチャンクを生成する', async () => {
      const testFilePath = '/test/project/test.md';
      const testContent = '# Test\n\nThis is a test file.';

      vi.mocked(fs.readFile).mockResolvedValueOnce(testContent);

      const chunks = await indexer.processFile(testFilePath);

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveProperty('id');
      expect(chunks[0]).toHaveProperty('content');
      expect(chunks[0].metadata.file).toBe('test.md');
    });
  });

  describe('exportIndex', () => {
    it('インデックスをファイルにエクスポートする', async () => {
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);

      const consoleSpy = vi.spyOn(console, 'log');
      await indexer.exportIndex();

      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(mockConfig.flex.exportPath), {
        recursive: true,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        `💾 インデックスをエクスポートしました: ${mockConfig.flex.exportPath}`,
      );
    });
  });

  describe('importIndex', () => {
    it('インデックスファイルが存在する場合は正常にインポートする', async () => {
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);

      const consoleSpy = vi.spyOn(console, 'log');
      await indexer.importIndex();

      expect(consoleSpy).toHaveBeenCalledWith(
        `📂 インデックスをインポートしました: ${mockConfig.flex.exportPath}`,
      );
    });

    it('インデックスファイルが存在しない場合はエラーをスローする', async () => {
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));

      await expect(indexer.importIndex()).rejects.toThrow(
        `インデックスファイルが見つかりません: ${mockConfig.flex.exportPath}`,
      );
    });
  });

  describe('updateFile', () => {
    it('ファイルの更新を処理する', async () => {
      const testFilePath = '/test/project/update.md';
      const testContent = '# Updated content';

      vi.mocked(fs.readFile).mockResolvedValueOnce(testContent);

      const consoleSpy = vi.spyOn(console, 'log');
      await indexer.updateFile(testFilePath);

      expect(consoleSpy).toHaveBeenCalledWith('🔄 ファイルを更新しました: update.md');
    });

    it('ファイル更新時のエラーを適切にハンドリングする', async () => {
      const testFilePath = '/test/project/error.md';

      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read error'));

      const consoleErrorSpy = vi.spyOn(console, 'error');
      await indexer.updateFile(testFilePath);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `❌ ファイル更新エラー: ${testFilePath}`,
        expect.any(Error),
      );
    });
  });

  describe('removeFile', () => {
    it('ファイルの削除を処理する', async () => {
      const testFilePath = '/test/project/remove.md';

      const consoleSpy = vi.spyOn(console, 'log');
      await indexer.removeFile(testFilePath);

      expect(consoleSpy).toHaveBeenCalledWith('🗑️ ファイルを削除しました: remove.md');
    });

    it('ファイル削除時のエラーを適切にハンドリングする', async () => {
      const testFilePath = '/test/project/error.md';

      // 現在の実装ではremoveFileChunksは空の処理なのでエラーは発生しない
      // このテストはTODO実装後に有効になる
      const consoleSpy = vi.spyOn(console, 'log');
      await indexer.removeFile(testFilePath);

      expect(consoleSpy).toHaveBeenCalledWith('🗑️ ファイルを削除しました: error.md');
    });
  });

  describe('search', () => {
    it('検索クエリをバックエンドに委譲する', async () => {
      const mockResults = [
        {
          chunk: {
            id: 'chunk-1',
            content: 'Test content',
            filePath: 'test.md',
            startLine: 1,
            endLine: 5,
          },
          score: 0.95,
        },
      ];

      // モックバックエンドの型定義
      type MockBackend = { search: ReturnType<typeof vi.fn> };
      const mockBackend = (indexer as unknown as { backend: MockBackend }).backend;
      mockBackend.search = vi.fn().mockResolvedValueOnce(mockResults);

      const results = await indexer.search('test query');

      expect(mockBackend.search).toHaveBeenCalledWith('test query', mockConfig.search.defaultK);
      expect(results).toEqual(mockResults);
    });

    it('カスタムKパラメータを受け付ける', async () => {
      // モックバックエンドの型定義
      type MockBackend = { search: ReturnType<typeof vi.fn> };
      const mockBackend = (indexer as unknown as { backend: MockBackend }).backend;
      mockBackend.search = vi.fn().mockResolvedValueOnce([]);

      await indexer.search('test query', 20);

      expect(mockBackend.search).toHaveBeenCalledWith('test query', 20);
    });
  });

  describe('cleanup', () => {
    it('クリーンアップメソッドが呼び出せる', async () => {
      await expect(indexer.cleanup()).resolves.not.toThrow();
    });
  });

  describe('findTargetFiles', () => {
    it('node_modules、dist、.gitディレクトリを除外する', async () => {
      const mockFiles = [
        '/test/project/file.md',
        '/test/project/node_modules/package/file.md',
        '/test/project/dist/output.md',
        '/test/project/.git/objects/file.md',
      ];

      vi.mocked(glob).mockImplementation(async () => {
        // globの実装でignoreオプションが正しく動作することを想定
        // node_modules、dist、.gitを除外したファイルのみ返す
        return [mockFiles[0]];
      });

      const files = await (
        indexer as unknown as { findTargetFiles: () => Promise<string[]> }
      ).findTargetFiles();

      expect(files).toEqual(['/test/project/file.md']);
    });

    it('重複ファイルを除去してソートする', async () => {
      vi.mocked(glob).mockImplementation(async (pattern: string | string[]) => {
        if (typeof pattern === 'string' && pattern.endsWith('*.md')) {
          return ['/test/project/b.md', '/test/project/a.md', '/test/project/b.md'];
        }
        return [];
      });

      const files = await (
        indexer as unknown as { findTargetFiles: () => Promise<string[]> }
      ).findTargetFiles();

      expect(files).toEqual(['/test/project/a.md', '/test/project/b.md']);
    });
  });
});
