import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlexBackend } from './FlexBackend.js';
import { Chunk } from './SearchBackend.js';

describe('FlexBackend', () => {
  let backend: FlexBackend;
  const testConfig = {
    profile: 'performance' as const,
  };

  // テスト用のサンプルチャンク
  const sampleChunks: Chunk[] = [
    new Chunk(
      'Chapter 1',
      'This is the first chapter about dragons and magic.',
      'test.md',
      1,
      3,
      0,
      ['fantasy', 'dragons'],
    ),
    new Chunk(
      'Chapter 2',
      'The hero discovers a secret cave filled with treasure.',
      'test.md',
      4,
      6,
      1,
      ['adventure', 'treasure'],
    ),
    new Chunk(
      'Chapter 3',
      'A wizard appears and teaches ancient spells to the protagonist.',
      'test.md',
      7,
      9,
      2,
      ['magic', 'wizard'],
    ),
  ];

  beforeEach(() => {
    backend = new FlexBackend(testConfig);
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    await backend.dispose();
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

      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('チャンクの追加と削除', () => {
    it('チャンクを追加できる', async () => {
      await backend.add(sampleChunks);
      const stats = await backend.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('チャンクをファイル単位で削除できる', async () => {
      await backend.add(sampleChunks);
      await backend.removeByFile('test.md');

      const results = await backend.search('dragons', 5);
      expect(results).toHaveLength(0);
    });

    it('異なるファイルのチャンクは残る', async () => {
      const otherFileChunk = new Chunk(
        'Other Chapter',
        'Content from other file.',
        'other.md',
        1,
        1,
        0,
      );
      await backend.add([...sampleChunks, otherFileChunk]);
      await backend.removeByFile('test.md');

      const results = await backend.search('Other Chapter', 5);
      expect(results).toHaveLength(1);
    });

    it('インデックスをクリアできる', async () => {
      await backend.add(sampleChunks);
      await backend.clear();

      const results = await backend.search('dragons', 5);
      expect(results).toHaveLength(0);
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

  // import/export機能は削除されました

  describe('エラーハンドリング', () => {
    it('初期化前の操作でエラーが発生する', async () => {
      const uninitializedBackend = new FlexBackend(testConfig);

      await expect(uninitializedBackend.search('test', 5)).rejects.toThrow('Index not initialized');
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
      expect(backend.isReady()).toBe(true);
    });

    it('存在しないファイルを削除してもエラーにならない', async () => {
      await backend.add(sampleChunks);
      await expect(backend.removeByFile('nonexistent.md')).resolves.not.toThrow();
    });

    it('タグなしのチャンクも正常に処理される', async () => {
      const chunkWithoutTags = new Chunk(
        'No Tags Chapter',
        'This chunk has no tags.',
        'notags.md',
        1,
        1,
        0,
      );

      await backend.add([chunkWithoutTags]);
      const results = await backend.search('tags', 5);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
