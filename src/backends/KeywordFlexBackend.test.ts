import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeywordFlexBackend } from './KeywordFlexBackend.js';
import { Chunk } from './SearchBackend.js';
import type { Preset } from 'flexsearch';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('KeywordFlexBackend', () => {
  let backend: KeywordFlexBackend;
  let tempDir: string;

  beforeEach(async () => {
    // 一時ディレクトリ作成
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keyword-test-'));
    process.chdir(tempDir);

    backend = new KeywordFlexBackend({
      profile: 'fast' as Preset,
      minWordLength: 2,
    });
  });

  afterEach(async () => {
    await backend.dispose();
    // 一時ディレクトリクリーンアップ
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // テスト用ファイル作成ヘルパー
  const createTestFile = async (fileName: string, content: string) => {
    const filePath = path.join(tempDir, fileName);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  };

  it('should initialize successfully', () => {
    expect(backend.isReady()).toBe(false);
  });

  it('should add and search Japanese text chunks', async () => {
    // テストファイル作成
    await createTestFile(
      'chapter1.md',
      '魔法学校の生徒アリスは炎の魔法を学んでいる。\n第二行\n第三行',
    );
    await createTestFile(
      'chapter2.md',
      '水の魔法使いボブと出会った。彼は氷の術を得意としている。\n第二行\n第三行',
    );

    const chunks: Chunk[] = [
      new Chunk(
        '第一章', // title
        '魔法学校の生徒アリスは炎の魔法を学んでいる。', // content
        'chapter1.md', // filePath
        1, // startLine
        3, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        ['魔法', '学校'], // tags
      ),
      new Chunk(
        '第二章', // title
        '水の魔法使いボブと出会った。彼は氷の術を得意としている。', // content
        'chapter2.md', // filePath
        1, // startLine
        3, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        ['魔法', '水'], // tags
      ),
    ];

    await backend.add(chunks);
    expect(backend.isReady()).toBe(true);

    // 「魔法」で検索
    const results = await backend.search('魔法', 5, 'test-novel-1');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet).toContain('魔法');
    expect(results[0].payload.file).toMatch(/chapter[12]\.md/);
  });

  it('should search by basic form (lemma)', async () => {
    // テストファイル作成
    const testFile = await createTestFile('lemma-test.md', '彼女は走った。彼は走る。\n第二行');

    const chunks: Chunk[] = [
      new Chunk(
        'テスト', // title
        '彼女は走った。彼は走る。', // content
        testFile, // filePath
        1, // startLine
        2, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        [], // tags
      ),
    ];

    await backend.add(chunks);

    // 「走る」で検索（基本形）
    const results = await backend.search('走る', 5, 'test-novel-1');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet).toContain('走');
  });

  it('should handle empty query', async () => {
    // テストファイル作成
    const testFile = await createTestFile('empty-query-test.md', 'テストコンテンツ');

    const chunks: Chunk[] = [
      new Chunk(
        'テスト', // title
        'テストコンテンツ', // content
        testFile, // filePath
        1, // startLine
        1, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        [], // tags
      ),
    ];

    await backend.add(chunks);

    const results = await backend.search('', 5, 'test-novel-1');
    expect(results).toEqual([]);
  });

  it('should remove chunks by file', async () => {
    // テストファイル作成
    const removeFile = await createTestFile('remove.md', '削除予定のファイル');
    const keepFile = await createTestFile('keep.md', '残すファイル');

    const chunks: Chunk[] = [
      new Chunk(
        'テスト1', // title
        '削除予定のファイル', // content
        removeFile, // filePath
        1, // startLine
        1, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        [], // tags
      ),
      new Chunk(
        'テスト2', // title
        '残すファイル', // content
        keepFile, // filePath
        1, // startLine
        1, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        [], // tags
      ),
    ];

    await backend.add(chunks);

    // 削除前は両方見つかる
    let results = await backend.search('ファイル', 5, 'test-novel-1');
    expect(results.length).toBe(2);

    // remove.mdを削除
    await backend.removeByFile(removeFile);

    // 削除後はkeep.mdのみ見つかる
    results = await backend.search('ファイル', 5, 'test-novel-1');
    expect(results.length).toBe(1);
    expect(results[0].payload.file).toBe(keepFile);
  });

  it('should clear all data', async () => {
    // テストファイル作成
    const testFile = await createTestFile('clear-test.md', 'クリア対象のデータ');

    const chunks: Chunk[] = [
      new Chunk(
        'テスト', // title
        'クリア対象のデータ', // content
        testFile, // filePath
        1, // startLine
        1, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        [], // tags
      ),
    ];

    await backend.add(chunks);

    let results = await backend.search('データ', 5, 'test-novel-1');
    expect(results.length).toBeGreaterThan(0);

    await backend.clear();

    results = await backend.search('データ', 5, 'test-novel-1');
    expect(results.length).toBe(0);
  });

  it('should handle morphological analysis fallback', async () => {
    // テストファイル作成
    const testFile = await createTestFile(
      'fallback-test.md',
      'English text that might fail morphological analysis',
    );

    const chunks: Chunk[] = [
      new Chunk(
        'Test', // title
        'English text that might fail morphological analysis', // content
        testFile, // filePath
        1, // startLine
        1, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        [], // tags
      ),
    ];

    await backend.add(chunks);

    // 英語テキストでもフォールバック検索で動作するはず
    const results = await backend.search('English', 5, 'test-novel-1');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet).toContain('English');
  });

  it('should respect minWordLength configuration', async () => {
    const backendWithFilter = new KeywordFlexBackend({
      profile: 'fast' as Preset,
      minWordLength: 3, // 3文字以上のみ
    });

    // テストファイル作成
    const testFile = await createTestFile('word-length-test.md', 'ああ こんにちは データベース');

    const chunks: Chunk[] = [
      new Chunk(
        'テスト', // title
        'ああ こんにちは データベース', // content
        testFile, // filePath
        1, // startLine
        1, // endLine
        0, // chunkIndex
        'test-novel-1', // novelId
        [], // tags
      ),
    ];

    await backendWithFilter.add(chunks);

    // 2文字の単語「ああ」は検索できない
    let results = await backendWithFilter.search('ああ', 5, 'test-novel-1');
    expect(results.length).toBe(0);

    // 5文字の単語「こんにちは」は検索できる
    results = await backendWithFilter.search('こんにちは', 5, 'test-novel-1');
    expect(results.length).toBeGreaterThan(0);

    await backendWithFilter.dispose();
  });

  it('should return correct chunk information in search results', async () => {
    // テストファイル作成
    await fs.mkdir(path.join(tempDir, 'story'), { recursive: true });
    const testFile = await createTestFile(
      'story/chapter1.md',
      '魔法使いの冒険が始まる。\n第二行\n第三行\n第四行\n第五行\n第六行\n第七行\n第八行\n第九行\n第十行\n第十一行\n第十二行\n第十三行\n第十四行\n第十五行',
    );

    const chunks: Chunk[] = [
      new Chunk(
        '第一章：出発', // title
        '魔法使いの冒険が始まる。', // content
        testFile, // filePath
        1, // startLine - content is on line 1
        1, // endLine
        2, // chunkIndex
        'test-novel-1', // novelId
        ['冒険', '魔法'], // tags
      ),
    ];

    await backend.add(chunks);

    const results = await backend.search('魔法使い', 1, 'test-novel-1');
    expect(results.length).toBe(1);

    const result = results[0];
    expect(result.id).toContain('::1-1::chunk-2@'); // ID includes hash
    expect(result.payload.file).toBe(testFile);
    expect(result.payload.start).toBe(1);
    expect(result.payload.end).toBe(1);
    expect(result.snippet).toContain('魔法使いの冒険が始まる。');
  });
});
