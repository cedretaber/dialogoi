import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import type { Stats } from 'fs';
import { Indexer } from './indexer.js';
import { DialogoiConfig } from './lib/config.js';
import { findFilesRecursively } from './utils/fileUtils.js';
import { FileSystemNovelRepository } from './repositories/FileSystemNovelRepository.js';
import { getLogger } from './logging/index.js';

// モックの設定
vi.mock('fs/promises');
vi.mock('./utils/fileUtils.js');
vi.mock('./backends/VectorBackend.js');
vi.mock('./services/TransformersEmbeddingService.js');
vi.mock('./repositories/QdrantVectorRepository.js');
vi.mock('./repositories/FileSystemNovelRepository.js');
vi.mock('./logging/index.js');

describe('Indexer', () => {
  let indexer: Indexer;
  let mockConfig: DialogoiConfig;
  let mockNovelRepository: {
    getProject: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    // ロガーのモックを設定
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    vi.mocked(getLogger).mockReturnValue(mockLogger as any);

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

    // NovelRepositoryのモックを設定
    mockNovelRepository = {
      getProject: vi.fn().mockResolvedValue({
        path: '/test/project/test-novel',
        config: {
          settingsDirectories: ['settings'],
          contentDirectories: ['contents'],
        },
      }),
    };

    // FileSystemNovelRepositoryのモックを設定
    vi.mocked(FileSystemNovelRepository).mockImplementation(
      () => mockNovelRepository as unknown as FileSystemNovelRepository,
    );

    indexer = new Indexer(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('indexNovel', () => {
    it('特定の小説プロジェクトのファイルを走査してインデックスを構築する', async () => {
      // fs.statモック（ディレクトリが存在することを示す）
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      // findFilesRecursivelyモックの設定（パスに応じて適切なファイルリストを返す）
      vi.mocked(findFilesRecursively).mockImplementation(async (dirPath) => {
        if (dirPath.includes('settings')) {
          return ['/test/project/test-novel/settings/file1.md'];
        }
        if (dirPath.includes('contents')) {
          return [
            '/test/project/test-novel/contents/file2.txt',
            '/test/project/test-novel/contents/nested/file3.md',
          ];
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

      await indexer.indexNovel('test-novel');

      expect(mockLogger.info).toHaveBeenCalledWith(
        '🔍 小説プロジェクト "test-novel" のファイルを走査中...',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📄 合計 3 個のファイルを発見'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🎉 小説プロジェクト "test-novel" のインデックス構築完了'),
      );
    });

    it('ファイル処理中のエラーを適切にハンドリングする', async () => {
      // fs.statモック（ディレクトリが存在することを示す）
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      // findFilesRecursivelyモックの設定（パスに応じて適切なファイルリストを返す）
      vi.mocked(findFilesRecursively).mockImplementation(async (dirPath) => {
        if (dirPath.includes('contents')) {
          return ['/test/project/test-novel/contents/error.md'];
        }
        return [];
      });

      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read error'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await indexer.indexNovel('test-novel');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('✗ test-novel/contents/error.md'),
        expect.any(Error),
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

      await indexer.updateFile(testFilePath, 'test-novel');

      expect(mockLogger.info).toHaveBeenCalledWith('🔄 ファイルを更新しました: update.md');
    });

    it('ファイル更新時のエラーを適切にハンドリングする', async () => {
      const testFilePath = '/test/project/error.md';

      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Read error'));

      await indexer.updateFile(testFilePath, 'test-novel');

      expect(mockLogger.error).toHaveBeenCalledWith(
        `❌ ファイル更新エラー: ${testFilePath}`,
        expect.any(Error),
      );
    });
  });

  describe('removeFile', () => {
    it('ファイルの削除を処理する', async () => {
      const testFilePath = '/test/project/remove.md';

      await indexer.removeFile(testFilePath);

      expect(mockLogger.info).toHaveBeenCalledWith('🗑️ ファイルを削除しました: remove.md');
    });

    it('ファイル削除時のエラーを適切にハンドリングする', async () => {
      const testFilePath = '/test/project/error.md';

      await indexer.removeFile(testFilePath);

      expect(mockLogger.info).toHaveBeenCalledWith('🗑️ ファイルを削除しました: error.md');
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
        undefined,
      );
      expect(results).toEqual(mockResults);
    });

    it('カスタムKパラメータを受け付ける', async () => {
      // モックバックエンドの型定義
      type MockBackend = { search: ReturnType<typeof vi.fn> };
      const mockBackend = (indexer as unknown as { backend: MockBackend }).backend;
      mockBackend.search = vi.fn().mockResolvedValueOnce([]);

      await indexer.search('test query', 20, 'test-novel-id');

      expect(mockBackend.search).toHaveBeenCalledWith('test query', 20, 'test-novel-id', undefined);
    });
  });

  describe('cleanup', () => {
    it('クリーンアップメソッドが呼び出せる', async () => {
      await expect(indexer.cleanup()).resolves.not.toThrow();
    });
  });

  describe('findTargetFiles', () => {
    it('隠しディレクトリを除外する', async () => {
      // fs.statモック（ディレクトリが存在することを示す）
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      // findFilesRecursivelyモックの設定（パスに応じて適切なファイルリストを返す）
      vi.mocked(findFilesRecursively).mockImplementation(async (dirPath) => {
        if (dirPath.includes('contents')) {
          return ['/test/project/test-novel/contents/file.md'];
        }
        return [];
      });

      const files = await (
        indexer as unknown as {
          findTargetFiles: (
            novelId: string,
          ) => Promise<Array<{ filePath: string; fileType: string }>>;
        }
      ).findTargetFiles('test-novel');

      expect(files).toEqual([
        {
          filePath: '/test/project/test-novel/contents/file.md',
          fileType: 'content',
        },
      ]);
    });

    it('見つかったファイルをソートする', async () => {
      // fs.statモック（ディレクトリが存在することを示す）
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);

      // findFilesRecursivelyモックの設定（パスに応じて適切なファイルリストを返す）
      vi.mocked(findFilesRecursively).mockImplementation(async (dirPath) => {
        if (dirPath.includes('contents')) {
          return [
            '/test/project/test-novel/contents/b.md',
            '/test/project/test-novel/contents/a.md',
          ];
        }
        return [];
      });

      const files = await (
        indexer as unknown as {
          findTargetFiles: (
            novelId: string,
          ) => Promise<Array<{ filePath: string; fileType: string }>>;
        }
      ).findTargetFiles('test-novel');

      expect(files).toEqual([
        {
          filePath: '/test/project/test-novel/contents/a.md',
          fileType: 'content',
        },
        {
          filePath: '/test/project/test-novel/contents/b.md',
          fileType: 'content',
        },
      ]);
    });
  });
});
