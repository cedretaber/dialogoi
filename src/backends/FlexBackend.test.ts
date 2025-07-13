import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlexBackend } from './FlexBackend.js';
import { Chunk } from './SearchBackend.js';
import fs from 'fs/promises';
import path from 'path';

describe('FlexBackend', () => {
  let backend: FlexBackend;
  const testExportPath = './test-cache/test-index.json';
  const testConfig = {
    profile: 'performance' as const,
    exportPath: testExportPath,
  };

  // テスト用のサンプルチャンク
  const sampleChunks: Chunk[] = [
    {
      id: 'test.md::1-3::chunk-0@hash1',
      title: 'Chapter 1',
      content: 'This is the first chapter about dragons and magic.',
      tags: ['fantasy', 'dragons'],
      metadata: {
        file: 'test.md',
        startLine: 1,
        endLine: 3,
      },
    },
    {
      id: 'test.md::4-6::chunk-1@hash2',
      title: 'Chapter 2',
      content: 'The hero discovers a secret cave filled with treasure.',
      tags: ['adventure', 'treasure'],
      metadata: {
        file: 'test.md',
        startLine: 4,
        endLine: 6,
      },
    },
    {
      id: 'test.md::7-9::chunk-2@hash3',
      title: 'Chapter 3',
      content: 'A wizard appears and teaches ancient spells to the protagonist.',
      tags: ['magic', 'wizard'],
      metadata: {
        file: 'test.md',
        startLine: 7,
        endLine: 9,
      },
    },
  ];

  beforeEach(() => {
    backend = new FlexBackend(testConfig);
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    await backend.dispose();
    try {
      await fs.unlink(testExportPath);
    } catch {
      // ファイルが存在しない場合は無視
    }
    try {
      await fs.rmdir(path.dirname(testExportPath));
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('初期化と基本操作', () => {
    it('初期状態では準備ができていない', () => {
      expect(backend.isReady()).toBe(false);
    });

    it('チャンクを追加すると準備完了状態になる', async () => {
      await backend.add([sampleChunks[0]]);
      expect(backend.isReady()).toBe(true);
    });

    it('統計情報を取得できる', async () => {
      await backend.add(sampleChunks);
      const stats = await backend.getStats();

      expect(stats.totalChunks).toBe(3);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('チャンクの追加と削除', () => {
    it('チャンクを追加できる', async () => {
      await backend.add(sampleChunks);
      const stats = await backend.getStats();
      expect(stats.totalChunks).toBe(3);
    });

    it('チャンクを削除できる', async () => {
      await backend.add(sampleChunks);
      await backend.remove([sampleChunks[0].id]);

      const stats = await backend.getStats();
      expect(stats.totalChunks).toBe(2);
    });

    it('複数のチャンクを一度に削除できる', async () => {
      await backend.add(sampleChunks);
      await backend.remove([sampleChunks[0].id, sampleChunks[1].id]);

      const stats = await backend.getStats();
      expect(stats.totalChunks).toBe(1);
    });

    it('インデックスをクリアできる', async () => {
      await backend.add(sampleChunks);
      await backend.clear();

      const stats = await backend.getStats();
      expect(stats.totalChunks).toBe(0);
    });
  });

  describe('検索機能', () => {
    beforeEach(async () => {
      await backend.add(sampleChunks);
    });

    it('タイトルで検索できる', async () => {
      const results = await backend.search('Chapter 1', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(sampleChunks[0].id);
      expect(results[0].payload.file).toBe('test.md');
      expect(results[0].payload.tags).toEqual(['fantasy', 'dragons']);
    });

    it('コンテンツで検索できる', async () => {
      const results = await backend.search('dragons', 5);

      expect(results.length).toBeGreaterThan(0);
      const dragonResult = results.find((r) => r.id === sampleChunks[0].id);
      expect(dragonResult).toBeDefined();
    });

    it('タグで検索できる', async () => {
      const results = await backend.search('magic', 5);

      expect(results.length).toBeGreaterThan(0);
      // magicタグを持つチャンクまたはmagicという単語を含むチャンクが見つかる
      expect(results.some((r) => r.payload.tags?.includes('magic'))).toBe(true);
    });

    it('複数キーワードで検索できる', async () => {
      const results = await backend.search('wizard spells', 5);

      expect(results.length).toBeGreaterThan(0);
      const wizardResult = results.find((r) => r.id === sampleChunks[2].id);
      expect(wizardResult).toBeDefined();
    });

    it('マッチしないクエリは空の結果を返す', async () => {
      const results = await backend.search('nonexistent keyword', 5);
      expect(results).toHaveLength(0);
    });

    it('結果数制限が機能する', async () => {
      const results = await backend.search('chapter', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('スコアが正規化されている', async () => {
      const results = await backend.search('chapter', 5);

      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it('スニペットが生成される', async () => {
      const results = await backend.search('dragons', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].snippet).toBeTruthy();
      expect(results[0].snippet.length).toBeLessThanOrEqual(120 + 6); // "..." を考慮
    });

    it('キーワードを含むスニペットが生成される', async () => {
      const results = await backend.search('treasure', 5);

      expect(results.length).toBeGreaterThan(0);
      const treasureResult = results.find((r) => r.snippet.toLowerCase().includes('treasure'));
      expect(treasureResult).toBeDefined();
    });
  });

  describe('エクスポート・インポート機能', () => {
    beforeEach(async () => {
      await backend.add(sampleChunks);
    });

    it('インデックスをエクスポートできる', async () => {
      await backend.exportIndex();

      const stats = await fs.stat(testExportPath);
      expect(stats.isFile()).toBe(true);
    });

    it('エクスポートしたインデックスをインポートできる', async () => {
      await backend.exportIndex();

      const newBackend = new FlexBackend(testConfig);
      await newBackend.importIndex();

      const stats = await newBackend.getStats();
      expect(stats.totalChunks).toBe(3);

      // 検索が正常に動作することを確認
      const results = await newBackend.search('dragons', 5);
      expect(results.length).toBeGreaterThan(0);

      await newBackend.dispose();
    });

    it('存在しないファイルをインポートしても新しいインデックスが作成される', async () => {
      const newBackend = new FlexBackend({
        profile: 'performance',
        exportPath: './nonexistent/path/index.json',
      });

      await newBackend.importIndex();
      expect(newBackend.isReady()).toBe(true);

      const stats = await newBackend.getStats();
      expect(stats.totalChunks).toBe(0);

      await newBackend.dispose();
    });

    it('カスタムパスでエクスポート・インポートできる', async () => {
      const customPath = './test-cache/custom-index.json';

      await backend.exportIndex(customPath);

      const newBackend = new FlexBackend(testConfig);
      await newBackend.importIndex(customPath);

      const stats = await newBackend.getStats();
      expect(stats.totalChunks).toBe(3);

      await newBackend.dispose();

      // クリーンアップ
      try {
        await fs.unlink(customPath);
      } catch {
        // ファイルが存在しない場合は無視
      }
    });

    it('エクスポートデータに正しい形式が含まれる', async () => {
      await backend.exportIndex();

      const data = await fs.readFile(testExportPath, 'utf-8');
      const exportData = JSON.parse(data);

      expect(exportData.version).toBe('1.0');
      expect(exportData.timestamp).toBeTruthy();
      expect(exportData.index).toBeTruthy();
      expect(exportData.chunks).toHaveLength(3);
      expect(exportData.config).toEqual(testConfig);
    });
  });

  describe('エラーハンドリング', () => {
    it('初期化前の操作でエラーが発生する', async () => {
      const uninitializedBackend = new FlexBackend(testConfig);

      await expect(uninitializedBackend.search('test', 5)).rejects.toThrow('Index not initialized');
    });

    it('不正なバージョンのインデックスでエラーが発生する', async () => {
      const invalidData = {
        version: '2.0',
        index: {},
        chunks: [],
        config: testConfig,
      };

      await fs.mkdir(path.dirname(testExportPath), { recursive: true });
      await fs.writeFile(testExportPath, JSON.stringify(invalidData));

      await expect(backend.importIndex()).rejects.toThrow('Unsupported index version: 2.0');
    });

    it('破損したエクスポートファイルでエラーが発生する', async () => {
      await fs.mkdir(path.dirname(testExportPath), { recursive: true });
      await fs.writeFile(testExportPath, 'invalid json');

      await expect(backend.importIndex()).rejects.toThrow('Failed to import index');
    });
  });

  describe('エッジケース', () => {
    it('空のクエリでも検索できる', async () => {
      await backend.add(sampleChunks);
      const results = await backend.search('', 5);
      expect(results).toEqual([]);
    });

    it('空のチャンク配列を追加できる', async () => {
      await backend.add([]);
      const stats = await backend.getStats();
      expect(stats.totalChunks).toBe(0);
    });

    it('存在しないIDを削除してもエラーにならない', async () => {
      await backend.add(sampleChunks);
      await expect(backend.remove(['nonexistent-id'])).resolves.not.toThrow();
    });

    it('タグなしのチャンクも正常に処理される', async () => {
      const chunkWithoutTags: Chunk = {
        id: 'notags.md::1-1::chunk-0@hash',
        title: 'No Tags Chapter',
        content: 'This chunk has no tags.',
        metadata: {
          file: 'notags.md',
          startLine: 1,
          endLine: 1,
        },
      };

      await backend.add([chunkWithoutTags]);
      const results = await backend.search('tags', 5);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
