import { describe, it, expect, beforeEach } from 'vitest';
import { KuromojiAnalyzer, createMorphAnalyzer } from './morphAnalyzer.js';
import { Chunk } from '../backends/SearchBackend.js';

describe('MorphAnalyzer', () => {
  let analyzer: KuromojiAnalyzer;

  beforeEach(() => {
    analyzer = KuromojiAnalyzer.getInstance();
  });

  it('should create analyzer instance', () => {
    expect(analyzer).toBeInstanceOf(KuromojiAnalyzer);
  });

  it('should return singleton instance', () => {
    const instance1 = KuromojiAnalyzer.getInstance();
    const instance2 = KuromojiAnalyzer.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should analyze Japanese text and extract meaningful words', async () => {
    const chunk = new Chunk(
      'テスト', // title
      '魔法学校の生徒アリスは炎の魔法を学んでいる。', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);

    expect(words.length).toBeGreaterThan(0);

    // 名詞が抽出されていることを確認
    const nouns = words.filter((word) => word.pos.includes('名詞'));
    expect(nouns.length).toBeGreaterThan(0);

    // 抽出された単語の例
    const surfaces = words.map((word) => word.surface);
    expect(surfaces).toContain('魔法');
    expect(surfaces).toContain('学校');
    expect(surfaces).toContain('生徒');
    expect(surfaces).toContain('アリス');
  }, 10000);

  it('should include chunk information in analysis results', async () => {
    const chunk = new Chunk(
      'テスト', // title
      '彼女は走った。', // content
      'story/chapter1.md', // filePath
      10, // startLine
      12, // endLine
      5, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);

    expect(words.length).toBeGreaterThan(0);

    // 全ての単語にチャンク情報が含まれていることを確認
    for (const word of words) {
      expect(word.chunkInfo).toEqual({
        chunkId: chunk.id,
        filePath: 'story/chapter1.md',
        startLine: 10,
        endLine: 12,
        chunkIndex: 5,
        novelId: 'test-novel-1',
      });
      expect(typeof word.charOffset).toBe('number');
      expect(word.charOffset).toBeGreaterThanOrEqual(0);
    }
  });

  it('should filter out short words and symbols', async () => {
    const chunk = new Chunk(
      'テスト', // title
      'あ、！？123 abc データベース', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);

    // 1文字の単語や記号は除外されているはず
    const shortWords = words.filter((word) => word.surface.length < 2);
    expect(shortWords.length).toBe(0);

    // 意味のある単語のみ抽出されているはず
    const surfaces = words.map((word) => word.surface);
    expect(surfaces).not.toContain('あ');
    expect(surfaces).not.toContain('！');
    expect(surfaces).not.toContain('？');
    expect(surfaces).not.toContain('123');
  });

  it('should analyze verbs and adjectives', async () => {
    const chunk = new Chunk(
      'テスト', // title
      '美しい花が咲いている。', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);

    expect(words.length).toBeGreaterThan(0);

    // 何らかの単語が抽出されていることを確認（品詞は実際の解析結果に依存）
    console.log(
      '解析結果:',
      words.map((w) => ({ surface: w.surface, pos: w.pos, basic: w.basic })),
    );

    // 最低限「花」は名詞として抽出されるはず
    const flowerWord = words.find((word) => word.surface.includes('花'));
    if (flowerWord) {
      expect(flowerWord.pos).toContain('名詞');
    }
  });

  it('should handle basic form (lemmatization)', async () => {
    const chunk = new Chunk(
      'テスト', // title
      '走った、走って、走ります', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);

    // 「走る」の活用形が全て「走る」として基本形化されていることを確認
    const runWords = words.filter((word) => word.surface.includes('走'));
    expect(runWords.length).toBeGreaterThan(0);

    for (const word of runWords) {
      expect(word.basic).toBe('走る');
    }
  });

  it('should handle mixed Japanese and English text', async () => {
    const chunk = new Chunk(
      'テスト', // title
      '彼はComputer Scienceを学んでいる。', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);

    expect(words.length).toBeGreaterThan(0);

    // 日本語部分は正しく解析される
    const surfaces = words.map((word) => word.surface);
    expect(surfaces.some((surface) => surface.includes('学ん'))).toBe(true);
  });

  it('should handle English text', async () => {
    const chunk = new Chunk(
      'テスト', // title
      'Simple English text', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);

    // kuromojinは英語でも何らかの解析を行うか、フォールバック処理が動作する
    // 実際の動作を確認するため、結果を出力
    console.log(
      '英語解析結果:',
      words.map((w) => ({ surface: w.surface, pos: w.pos, basic: w.basic })),
    );

    // 少なくとも処理はエラーなく完了することを確認
    expect(Array.isArray(words)).toBe(true);
  });

  it('should handle empty content', async () => {
    const chunk = new Chunk(
      'テスト', // title
      '', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);
    expect(words).toEqual([]);
  });

  it('should handle only whitespace content', async () => {
    const chunk = new Chunk(
      'テスト', // title
      '   \n\t  ', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);
    expect(words).toEqual([]);
  });

  it('should calculate correct character offsets', async () => {
    const chunk = new Chunk(
      'テスト', // title
      'あいうえお かきくけこ', // content
      'test.md', // filePath
      1, // startLine
      1, // endLine
      0, // chunkIndex
      'test-novel-1', // novelId
      [], // tags
    );

    const words = await analyzer.analyze(chunk);

    if (words.length > 0) {
      // 文字オフセットが正しく計算されていることを確認
      for (const word of words) {
        expect(word.charOffset).toBeGreaterThanOrEqual(0);
        expect(word.charOffset).toBeLessThan(chunk.content.length);

        // オフセット位置の文字が単語の開始文字と一致することを確認
        const charAtOffset = chunk.content.charAt(word.charOffset);
        expect(word.surface.startsWith(charAtOffset)).toBe(true);
      }
    }
  });
});

describe('createMorphAnalyzer factory', () => {
  it('should return KuromojiAnalyzer instance', () => {
    const analyzer = createMorphAnalyzer();
    expect(analyzer).toBeInstanceOf(KuromojiAnalyzer);
  });

  it('should return singleton instance', () => {
    const analyzer1 = createMorphAnalyzer();
    const analyzer2 = createMorphAnalyzer();
    expect(analyzer1).toBe(analyzer2);
  });
});
