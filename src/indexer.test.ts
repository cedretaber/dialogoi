import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import type { Stats } from 'fs';
import { Indexer } from './indexer.js';
import { DialogoiConfig } from './lib/config.js';
import { findFilesRecursively } from './utils/fileUtils.js';

// モックの設定
vi.mock('fs/promises');
vi.mock('./utils/fileUtils.js');
vi.mock('./backends/VectorBackend.js');
vi.mock('./services/TransformersEmbeddingService.js');
vi.mock('./repositories/QdrantVectorRepository.js');

describe('Indexer', () => {
  let indexer: Indexer;
  let mockConfig: DialogoiConfig;
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      projectRoot: testProjectRoot,
      chunk: {
        maxTokens: 400,
        overlap: 50,
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
        docker: {
          enabled: false,
          image: 'qdrant/qdrant',
          timeout: 30000,
          autoCleanup: true,
        },
      },
      docker: {
        qdrant: {
          containerName: 'test-qdrant',
          image: 'qdrant/qdrant',
          port: 6333,
        },
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

    indexer = new Indexer(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('indexNovel', () => {
    it('特定の小説プロジェクトのファイルを走査してインデックスを構築する', async () => {
      const mockFiles = [
        '/test/project/test-novel/file1.md',
        '/test/project/test-novel/file2.txt',
        '/test/project/test-novel/nested/file3.md',
      ];

      // fs.statモック（ディレクトリが存在することを示す）
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      // findFilesRecursivelyモックの設定
      vi.mocked(findFilesRecursively).mockResolvedValue(mockFiles);

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

      const consoleSpy = vi.spyOn(console, 'error');
      await indexer.indexNovel('test-novel');

      expect(consoleSpy).toHaveBeenCalledWith(
        '🔍 小説プロジェクト "test-novel" のファイルを走査中...',
      );
      expect(consoleSpy).toHaveBeenCalledWith('📄 3 個のファイルを発見');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🎉 小説プロジェクト "test-novel" のインデックス構築完了'),
      );
    });

    it('ファイル処理中のエラーを適切にハンドリングする', async () => {
      const mockFiles = ['/test/project/test-novel/error.md'];

      // fs.statモック（ディレクトリが存在することを示す）
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      vi.mocked(findFilesRecursively).mockResolvedValue(mockFiles);
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read error'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const consoleErrorSpy = vi.spyOn(console, 'error');
      await indexer.indexNovel('test-novel');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗ test-novel/error.md: Error:'),
      );
    });
  });

  describe('processFile', () => {
    it('ファイルを読み込んでチャンクを生成する', async () => {
      const testFilePath = '/test/project/test.md';
      const testContent = '# Test\n\nThis is a test file.';

      vi.mocked(fs.readFile).mockResolvedValueOnce(testContent);

      const chunks = await indexer.processFile(testFilePath, 'test-novel');

      expect(chunks).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveProperty('id');
      expect(chunks[0]).toHaveProperty('content');
      expect(chunks[0].relativeFilePath).toBe('test.md');
    });
  });

  describe('updateFile', () => {
    it('ファイルの更新を処理する', async () => {
      const testFilePath = '/test/project/update.md';
      const testContent = '# Updated content';

      vi.mocked(fs.readFile).mockResolvedValueOnce(testContent);

      const consoleSpy = vi.spyOn(console, 'error');
      await indexer.updateFile(testFilePath, 'test-novel');

      expect(consoleSpy).toHaveBeenCalledWith('🔄 ファイルを更新しました: update.md');
    });

    it('ファイル更新時のエラーを適切にハンドリングする', async () => {
      const testFilePath = '/test/project/error.md';

      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read error'));

      const consoleErrorSpy = vi.spyOn(console, 'error');
      await indexer.updateFile(testFilePath, 'test-novel');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `❌ ファイル更新エラー: ${testFilePath}`,
        expect.any(Error),
      );
    });
  });

  describe('removeFile', () => {
    it('ファイルの削除を処理する', async () => {
      const testFilePath = '/test/project/remove.md';

      const consoleSpy = vi.spyOn(console, 'error');
      await indexer.removeFile(testFilePath);

      expect(consoleSpy).toHaveBeenCalledWith('🗑️ ファイルを削除しました: remove.md');
    });

    it('ファイル削除時のエラーを適切にハンドリングする', async () => {
      const testFilePath = '/test/project/error.md';

      const consoleSpy = vi.spyOn(console, 'error');
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

      const results = await indexer.search('test query', 10, 'test-novel-id');

      expect(mockBackend.search).toHaveBeenCalledWith(
        'test query',
        mockConfig.search.defaultK,
        'test-novel-id',
      );
      expect(results).toEqual(mockResults);
    });

    it('カスタムKパラメータを受け付ける', async () => {
      // モックバックエンドの型定義
      type MockBackend = { search: ReturnType<typeof vi.fn> };
      const mockBackend = (indexer as unknown as { backend: MockBackend }).backend;
      mockBackend.search = vi.fn().mockResolvedValueOnce([]);

      await indexer.search('test query', 20, 'test-novel-id');

      expect(mockBackend.search).toHaveBeenCalledWith('test query', 20, 'test-novel-id');
    });
  });

  describe('cleanup', () => {
    it('クリーンアップメソッドが呼び出せる', async () => {
      await expect(indexer.cleanup()).resolves.not.toThrow();
    });
  });

  describe('findTargetFiles', () => {
    it('隠しディレクトリを除外する', async () => {
      const mockFiles = [
        '/test/project/file.md',
        '/test/project/.cache/temp.md',
        '/test/project/.git/config.md',
        '/test/project/.hidden/secret.md',
      ];

      // fs.statモック（ディレクトリが存在することを示す）
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      vi.mocked(findFilesRecursively).mockResolvedValue([mockFiles[0]]);

      const files = await (
        indexer as unknown as { findTargetFiles: (novelId: string) => Promise<string[]> }
      ).findTargetFiles('test-novel');

      expect(files).toEqual(['/test/project/file.md']);
    });

    it('見つかったファイルをソートする', async () => {
      // fs.statモック（ディレクトリが存在することを示す）
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      vi.mocked(findFilesRecursively).mockResolvedValue([
        '/test/project/b.md',
        '/test/project/a.md',
      ]);

      const files = await (
        indexer as unknown as { findTargetFiles: (novelId: string) => Promise<string[]> }
      ).findTargetFiles('test-novel');

      expect(files).toEqual(['/test/project/a.md', '/test/project/b.md']);
    });
  });
});
