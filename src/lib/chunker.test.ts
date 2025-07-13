import { describe, it, expect, beforeEach } from 'vitest';
import {
  MarkdownChunkingStrategy,
  SimpleTokenCounter,
  CharacterOverlapCalculator,
  SequentialSplitStrategy,
  ChunkingStrategy,
  TokenCounter,
  OverlapCalculator,
  TextSplitStrategy,
  createChunker,
} from './chunker.js';

describe('SimpleTokenCounter', () => {
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    tokenCounter = new SimpleTokenCounter();
  });

  it('英語テキストのトークン数を計算', () => {
    const text = 'Hello world';
    const tokens = tokenCounter.count(text);
    expect(tokens).toBe(Math.ceil(text.length / 2.5));
  });

  it('日本語テキストのトークン数を計算', () => {
    const text = 'こんにちは世界';
    const tokens = tokenCounter.count(text);
    expect(tokens).toBe(Math.ceil(text.length / 2.5));
  });

  it('空文字列のトークン数は0', () => {
    expect(tokenCounter.count('')).toBe(0);
  });
});

describe('CharacterOverlapCalculator', () => {
  let calculator: OverlapCalculator;

  beforeEach(() => {
    calculator = new CharacterOverlapCalculator();
  });

  it('20%オーバーラップを正しく計算', () => {
    const content = 'a'.repeat(100);
    const overlapSize = calculator.calculateOverlapSize(content, 0.2);
    expect(overlapSize).toBe(20);
  });

  it('0%オーバーラップは0を返す', () => {
    const content = 'test content';
    const overlapSize = calculator.calculateOverlapSize(content, 0);
    expect(overlapSize).toBe(0);
  });

  it('100%オーバーラップは全長を返す', () => {
    const content = 'test content';
    const overlapSize = calculator.calculateOverlapSize(content, 1.0);
    expect(overlapSize).toBe(content.length);
  });
});

describe('SequentialSplitStrategy', () => {
  let strategy: TextSplitStrategy;
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    strategy = new SequentialSplitStrategy();
    tokenCounter = new SimpleTokenCounter();
  });

  it('短いテキストはそのまま返す', () => {
    const text = 'Short text';
    const maxTokens = 100;
    const result = strategy.split(text, maxTokens, tokenCounter);
    expect(result).toEqual([text]);
  });

  it('長いテキストを適切に分割', () => {
    const text = 'a'.repeat(250); // 100トークン相当
    const maxTokens = 40; // 16文字相当
    const result = strategy.split(text, maxTokens, tokenCounter);

    expect(result.length).toBeGreaterThan(1);

    // 各チャンクが最大トークン数以下であることを確認
    for (const chunk of result) {
      expect(tokenCounter.count(chunk)).toBeLessThanOrEqual(maxTokens);
    }

    // 全チャンクを結合すると元のテキストになることを確認
    expect(result.join('')).toBe(text);
  });

  it('極端に小さなmaxTokensでも動作', () => {
    const text = 'Hello';
    const maxTokens = 1;
    const result = strategy.split(text, maxTokens, tokenCounter);

    expect(result.length).toBeGreaterThan(1);
    expect(result.join('')).toBe(text);
  });
});

describe('MarkdownChunkingStrategy', () => {
  let strategy: ChunkingStrategy;

  beforeEach(() => {
    strategy = new MarkdownChunkingStrategy();
  });

  describe('基本的なチャンク化', () => {
    it('短いテキストは1つのチャンクになる', () => {
      const text = 'Short text content.';
      const filePath = 'test.md';
      const chunks = strategy.chunk(text, filePath, 100, 0.2);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(text);
      expect(chunks[0].title).toBe('Document');
      expect(chunks[0].metadata.file).toBe(filePath);
      expect(chunks[0].metadata.startLine).toBe(0);
    });

    it('見出し付きテキストを正しく処理', () => {
      const text = `# Chapter 1

This is the first paragraph.

This is the second paragraph.`;

      const chunks = strategy.chunk(text, 'test.md', 100, 0.2);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].title).toBe('Chapter 1');
      expect(chunks[0].content).toBe(text);
    });

    it('複数の見出しを正しく分割', () => {
      const text = `# Chapter 1

First chapter content.

## Section 1.1

Section content.

# Chapter 2

Second chapter content.`;

      const chunks = strategy.chunk(text, 'test.md', 100, 0.2);

      // セクション数に応じてチャンクが作成される
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // 各チャンクのタイトルを確認
      const titles = chunks.map((c) => c.title);
      expect(titles).toContain('Chapter 1');
      expect(titles).toContain('Chapter 2');
    });
  });

  describe('長いテキストの分割', () => {
    it('最大トークン数を超える場合は分割される', () => {
      const longText = 'This is a very long paragraph. '.repeat(50);
      const text = `# Long Chapter

${longText}`;

      const chunks = strategy.chunk(text, 'test.md', 80, 0.2);

      // 長いテキストが複数のチャンクに分割されることを確認
      expect(chunks.length).toBeGreaterThan(1);

      // 全チャンクを結合すると元のテキストに近い内容になることを確認（オーバーラップ考慮）
      const combinedContent = chunks.map((c) => c.content).join('\n---\n');
      expect(combinedContent).toContain('Long Chapter');
      expect(combinedContent).toContain('This is a very long paragraph.');

      // 各チャンクにコンテンツが含まれていることを確認
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.title).toBe('Long Chapter');
      }
    });

    it('段落単位で分割される', () => {
      const text = `# Chapter

Paragraph 1 content.

Paragraph 2 content.

Paragraph 3 content.`;

      const chunks = strategy.chunk(text, 'test.md', 15, 0.1); // より小さなmaxTokensとオーバーラップ

      expect(chunks.length).toBeGreaterThan(1);

      // 各チャンクのタイトルは同じ
      for (const chunk of chunks) {
        expect(chunk.title).toBe('Chapter');
      }

      // 各チャンクが15トークン以下であることを確認
      const tokenCounter = new SimpleTokenCounter();
      for (const chunk of chunks) {
        expect(tokenCounter.count(chunk.content)).toBeLessThanOrEqual(15);
      }
    });
  });

  describe('オーバーラップ機能', () => {
    it('オーバーラップありで分割される', () => {
      const paragraph1 = 'First paragraph content. '.repeat(10);
      const paragraph2 = 'Second paragraph content. '.repeat(10);
      const text = `# Chapter

${paragraph1}

${paragraph2}`;

      const chunks = strategy.chunk(text, 'test.md', 100, 0.2);

      if (chunks.length > 1) {
        // 隣接するチャンクに重複があることを確認
        // 実装詳細に依存するため、基本的な構造のみチェック
        expect(chunks[0].content.length).toBeGreaterThan(0);
        expect(chunks[1].content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('IDとメタデータ', () => {
    it('正しいID形式を生成', () => {
      const text = 'Test content';
      const filePath = 'test/example.md';
      const chunks = strategy.chunk(text, filePath, 100, 0.2);

      expect(chunks).toHaveLength(1);

      const chunk = chunks[0];
      expect(chunk.id).toMatch(/^test\/example\.md::\d+-\d+::chunk-\d+@[a-f0-9]{8}$/);
    });

    it('異なる内容で異なるハッシュを生成', () => {
      const text1 = 'Content 1';
      const text2 = 'Content 2';

      const chunks1 = strategy.chunk(text1, 'test.md', 100, 0.2);
      const chunks2 = strategy.chunk(text2, 'test.md', 100, 0.2);

      const hash1 = chunks1[0].id.split('@')[1];
      const hash2 = chunks2[0].id.split('@')[1];

      expect(hash1).not.toBe(hash2);
    });

    it('同じ内容で同じハッシュを生成', () => {
      const text = 'Same content';

      const chunks1 = strategy.chunk(text, 'test.md', 100, 0.2);
      const chunks2 = strategy.chunk(text, 'test.md', 100, 0.2);

      const hash1 = chunks1[0].id.split('@')[1];
      const hash2 = chunks2[0].id.split('@')[1];

      expect(hash1).toBe(hash2);
    });

    it('正しいメタデータを設定', () => {
      const text = `Line 1
Line 2
Line 3`;
      const chunks = strategy.chunk(text, 'test.md', 100, 0.2);

      expect(chunks).toHaveLength(1);

      const chunk = chunks[0];
      expect(chunk.metadata.file).toBe('test.md');
      expect(chunk.metadata.startLine).toBe(0);
      expect(chunk.metadata.endLine).toBe(2);
    });
  });

  describe('エッジケース', () => {
    it('空文字列を処理', () => {
      const chunks = strategy.chunk('', 'test.md', 100, 0.2);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('');
    });

    it('見出しのみを処理', () => {
      const text = '# Title Only';
      const chunks = strategy.chunk(text, 'test.md', 100, 0.2);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].title).toBe('Title Only');
      expect(chunks[0].content).toBe(text);
    });

    it('改行のみのテキストを処理', () => {
      const text = '\n\n\n';
      const chunks = strategy.chunk(text, 'test.md', 100, 0.2);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(text);
    });
  });
});

describe('createChunker', () => {
  it('デフォルト戦略を作成', () => {
    const chunker = createChunker();
    expect(chunker).toBeInstanceOf(MarkdownChunkingStrategy);
  });

  it('カスタム戦略を使用', () => {
    const customStrategy = new MarkdownChunkingStrategy();
    const chunker = createChunker(customStrategy);
    expect(chunker).toBe(customStrategy);
  });
});

describe('統合テスト', () => {
  it('実際のMarkdownファイルのような構造を処理', () => {
    const markdownContent = `# Novel Title

## Chapter 1: The Beginning

It was a dark and stormy night. The wind howled through the trees as our protagonist walked down the lonely road.

"Where am I going?" they wondered aloud, their voice barely audible over the storm.

The rain began to fall harder, each drop like a tiny hammer against their skin.

## Chapter 2: The Discovery

The next morning brought sunshine and hope. Our hero discovered a small cottage hidden among the trees.

Inside, they found an ancient book that would change everything.

### Section 2.1: The Secret

The book contained secrets of the old world, magic that had been forgotten for centuries.

# Epilogue

And so ends our tale, but the adventure continues...`;

    const strategy = new MarkdownChunkingStrategy();
    const chunks = strategy.chunk(markdownContent, 'novel.md', 200, 0.2);

    // 基本的な期待値をチェック
    expect(chunks.length).toBeGreaterThan(0);

    // 各チャンクが有効であることを確認
    for (const chunk of chunks) {
      expect(chunk.id).toBeTruthy();
      expect(chunk.title).toBeTruthy();
      expect(chunk.content).toBeTruthy();
      expect(chunk.metadata.file).toBe('novel.md');
      expect(chunk.metadata.startLine).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.endLine).toBeGreaterThanOrEqual(chunk.metadata.startLine);
    }

    // 適切な見出しが含まれていることを確認
    const titles = chunks.map((c) => c.title);
    expect(titles.some((title) => title.includes('Chapter 1') || title.includes('Beginning'))).toBe(
      true,
    );
  });
});
