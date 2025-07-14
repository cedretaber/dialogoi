import { Document, DocumentData } from 'flexsearch';
import type { Preset } from 'flexsearch';
import { SearchBackend, SearchResult, Chunk } from './SearchBackend.js';
import { MorphAnalyzer, createMorphAnalyzer } from '../lib/morphAnalyzer.js';

/**
 * FlexSearchキーワード設定オプション
 */
interface KeywordFlexSearchConfig {
  profile: Preset;
  minWordLength?: number; // インデックス対象の最小文字数（デフォルト: 2）
}

/**
 * 単語の位置情報
 */
interface WordPosition {
  id: number; // ユニークID
  word: string; // 表層形
  basic: string; // 基本形
  reading?: string; // 読み
  pos: string; // 品詞
  charOffset: number; // チャンク内文字オフセット
  chunkInfo: {
    // チャンク情報
    chunkId: string; // チャンクID
    filePath: string; // ファイルパス
    startLine: number; // チャンク開始行
    endLine: number; // チャンク終了行
    chunkIndex: number; // チャンクインデックス
    novelId: string; // 小説プロジェクトID
  };
}

/**
 * FlexSearchに格納するドキュメント
 */
interface WordDocument extends DocumentData {
  id: number; // ユニークID
  word: string; // 表層形
  basic: string; // 基本形
  reading: string | null; // 読み
  pos: string; // 品詞
  charOffset: number; // チャンク内文字オフセット
  chunkId: string; // チャンクID
  filePath: string; // ファイルパス
  startLine: number; // チャンク開始行
  endLine: number; // チャンク終了行
  chunkIndex: number; // チャンクインデックス
  novelId: string; // 小説プロジェクトID
}

/**
 * キーワードベースのFlexSearchバックエンド実装
 * 形態素解析された単語レベルでインデックスを作成し、
 * 検索結果から前後のコンテキストを取得
 */
export class KeywordFlexBackend extends SearchBackend {
  private wordIndex: Document<WordDocument> | null = null;
  private morphAnalyzer: MorphAnalyzer;
  private config: KeywordFlexSearchConfig;
  private isInitialized = false;
  private nextId = 1;
  // チャンク内容はキャッシュせず、必要時にファイルから読み込む

  constructor(config: KeywordFlexSearchConfig) {
    super();
    this.config = {
      minWordLength: 2,
      ...config,
    };
    this.morphAnalyzer = createMorphAnalyzer();
  }

  /**
   * インデックスを初期化
   */
  private async initializeIndex(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // FlexSearchのワードインデックス設定
    this.wordIndex = new Document({
      preset: this.config.profile,
      document: {
        id: 'id',
        index: [
          {
            field: 'word',
            tokenize: 'reverse', // 前後部分一致
          },
          {
            field: 'basic',
            tokenize: 'reverse', // 基本形でも検索可能
          },
          {
            field: 'reading',
            tokenize: 'reverse', // 読みでも検索可能
          },
        ],
        tag: ['pos', 'filePath', 'novelId'], // 品詞・ファイルパス・小説IDでフィルタリング可能
        store: true,
      },
    });

    this.isInitialized = true;
  }

  /**
   * チャンクの内容をファイルから読み込み
   */
  private async getChunkContent(
    filePath: string,
    startLine: number,
    endLine: number,
  ): Promise<string> {
    try {
      const content = await import('fs/promises').then((fs) => fs.readFile(filePath, 'utf-8'));
      const lines = content.split('\n');

      const start = Math.max(0, startLine - 1); // 1ベースから0ベースに変換
      const end = Math.min(lines.length, endLine);

      return lines.slice(start, end).join('\n');
    } catch (error) {
      console.error(`ファイル読み込みエラー: ${filePath}`, error);
      return '';
    }
  }

  /**
   * チャンクからキーワードを抽出してインデックスに追加
   */
  async add(chunks: Chunk[]): Promise<void> {
    await this.initializeIndex();

    if (!this.wordIndex) {
      throw new Error('Word index not initialized');
    }

    for (const chunk of chunks) {
      try {
        // 形態素解析でキーワードを抽出
        const words = await this.morphAnalyzer.analyze(chunk);

        // 各単語をインデックスに追加
        for (const word of words) {
          if (word.surface.length >= this.config.minWordLength!) {
            const wordDoc: WordDocument = {
              id: this.nextId++,
              word: word.surface,
              basic: word.basic,
              reading: word.reading || null,
              pos: word.pos,
              charOffset: word.charOffset,
              chunkId: word.chunkInfo.chunkId,
              filePath: word.chunkInfo.filePath,
              startLine: word.chunkInfo.startLine,
              endLine: word.chunkInfo.endLine,
              chunkIndex: word.chunkInfo.chunkIndex,
              novelId: word.chunkInfo.novelId,
            };

            this.wordIndex.add(wordDoc);
          }
        }
      } catch (error) {
        console.error(`チャンク処理エラー: ${chunk.id}`, error);
      }
    }
  }

  /**
   * キーワード検索を実行
   */
  async search(query: string, k: number, novelId: string): Promise<SearchResult[]> {
    if (!this.isInitialized || !this.wordIndex) {
      throw new Error('Word index not initialized');
    }

    if (!query || query.trim() === '') {
      return [];
    }

    try {
      // クエリを形態素解析（ダミーのチャンク情報を使用）
      const dummyChunk = new Chunk(
        '', // title
        query, // content
        '', // filePath
        1, // startLine
        1, // endLine
        0, // chunkIndex
        novelId, // novelId
        [], // tags
      );
      const queryWords = await this.morphAnalyzer.analyze(dummyChunk);

      if (queryWords.length === 0) {
        // フォールバック: そのまま検索
        return this.searchDirect(query, k, novelId);
      }

      // 各単語で検索実行
      const allResults = new Map<string, WordPosition>();

      for (const queryWord of queryWords) {
        // 表層形、基本形、読みで検索
        const searchTargets = [queryWord.surface, queryWord.basic];
        if (queryWord.reading) {
          searchTargets.push(queryWord.reading);
        }

        for (const target of searchTargets) {
          const results = await this.wordIndex.search(target, {
            limit: 50,
            enrich: true,
            tag: { novelId },
          });

          // 検索結果を処理
          if (Array.isArray(results)) {
            for (const fieldResult of results) {
              if (fieldResult && typeof fieldResult === 'object' && 'result' in fieldResult) {
                const fieldResults = fieldResult.result;
                if (Array.isArray(fieldResults)) {
                  for (const item of fieldResults) {
                    if (item && typeof item === 'object' && 'doc' in item && item.doc) {
                      const doc = item.doc as WordDocument;
                      const key = `${doc.chunkId}`;

                      if (!allResults.has(key)) {
                        allResults.set(key, {
                          id: doc.id,
                          word: doc.word,
                          basic: doc.basic,
                          reading: doc.reading || undefined,
                          pos: doc.pos,
                          charOffset: doc.charOffset,
                          chunkInfo: {
                            chunkId: doc.chunkId,
                            filePath: doc.filePath,
                            startLine: doc.startLine,
                            endLine: doc.endLine,
                            chunkIndex: doc.chunkIndex,
                            novelId: doc.novelId,
                          },
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 結果を文書・行単位で集約してコンテキストを取得
      return this.buildSearchResults(Array.from(allResults.values()), query, k);
    } catch (error) {
      console.error('検索エラー:', error);
      return this.searchDirect(query, k, novelId);
    }
  }

  /**
   * 直接検索（形態素解析なし）
   */
  private async searchDirect(query: string, k: number, novelId: string): Promise<SearchResult[]> {
    if (!this.isInitialized || !this.wordIndex) {
      throw new Error('Word index not initialized');
    }

    const results = await this.wordIndex.search(query, {
      limit: k * 2,
      enrich: true,
      tag: { novelId },
    });

    const positions: WordPosition[] = [];

    if (Array.isArray(results)) {
      for (const fieldResult of results) {
        if (fieldResult && typeof fieldResult === 'object' && 'result' in fieldResult) {
          const fieldResults = fieldResult.result;
          if (Array.isArray(fieldResults)) {
            for (const item of fieldResults) {
              if (item && typeof item === 'object' && 'doc' in item && item.doc) {
                const doc = item.doc as WordDocument;
                positions.push({
                  id: doc.id,
                  word: doc.word,
                  basic: doc.basic,
                  reading: doc.reading || undefined,
                  pos: doc.pos,
                  charOffset: doc.charOffset,
                  chunkInfo: {
                    chunkId: doc.chunkId,
                    filePath: doc.filePath,
                    startLine: doc.startLine,
                    endLine: doc.endLine,
                    chunkIndex: doc.chunkIndex,
                    novelId: doc.novelId,
                  },
                });
              }
            }
          }
        }
      }
    }

    return this.buildSearchResults(positions, query, k);
  }

  /**
   * 検索結果の構築
   */
  private async buildSearchResults(
    positions: WordPosition[],
    query: string,
    k: number,
  ): Promise<SearchResult[]> {
    // チャンク単位でグループ化
    const grouped = new Map<string, WordPosition[]>();

    for (const pos of positions) {
      const key = pos.chunkInfo.chunkId;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(pos);
    }

    // 結果を構築
    const results: SearchResult[] = [];

    for (const [, positions] of grouped.entries()) {
      if (results.length >= k) break;

      const firstPos = positions[0];
      const chunkContent = await this.getChunkContent(
        firstPos.chunkInfo.filePath,
        firstPos.chunkInfo.startLine,
        firstPos.chunkInfo.endLine,
      );

      // スニペットを生成
      const highlightedSnippet = this.highlightSnippet(chunkContent, query);

      results.push({
        id: firstPos.chunkInfo.chunkId,
        score: this.calculateScore(positions.length),
        snippet: highlightedSnippet,
        payload: {
          file: firstPos.chunkInfo.filePath,
          start: firstPos.chunkInfo.startLine,
          end: firstPos.chunkInfo.endLine,
          tags: positions.map((p) => p.pos),
        },
      });
    }

    // スコア順にソート
    return results.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /**
   * スコア計算（単純な出現頻度ベース）
   */
  private calculateScore(wordCount: number): number {
    return Math.min(1.0, wordCount / 10);
  }

  /**
   * スニペットのハイライト
   */
  private highlightSnippet(snippet: string, _query: string): string {
    // 簡易的なハイライト実装（将来的にはクエリでハイライト）
    return snippet;
  }

  /**
   * チャンクを差分更新（ハッシュ値による重複チェック）
   */
  async updateChunks(chunks: Chunk[]): Promise<{
    added: number;
    updated: number;
    unchanged: number;
  }> {
    // ファイルパスでグルーピング
    const groupedByFile = new Map<string, Chunk[]>();
    for (const chunk of chunks) {
      if (!groupedByFile.has(chunk.filePath)) {
        groupedByFile.set(chunk.filePath, []);
      }
      groupedByFile.get(chunk.filePath)!.push(chunk);
    }

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    // ファイル単位で処理
    for (const [filePath, fileChunks] of groupedByFile) {
      // 既存のファイルの単語を一回だけ削除
      await this.removeByFile(filePath);

      // 新しい単語をまとめて追加
      await this.add(fileChunks);
      updated += fileChunks.length; // 簡略化のため、すべて更新として扱う
    }

    return { added, updated, unchanged };
  }

  /**
   * 指定ファイルに関連する単語をすべて削除
   */
  async removeByFile(filePath: string): Promise<void> {
    await this.initializeIndex();

    if (!this.wordIndex) {
      throw new Error('Word index not initialized');
    }

    // ファイルパスタグで検索して削除
    const searchResults = await this.wordIndex.search({
      tag: { filePath },
      enrich: false,
    });

    if (Array.isArray(searchResults)) {
      for (const result of searchResults) {
        if (Array.isArray(result.result)) {
          for (const id of result.result) {
            this.wordIndex.remove(id);
          }
        }
      }
    }

    // キャッシュを使用しないため、追加のクリーンアップ不要
  }

  /**
   * インデックスをクリア
   */
  async clear(): Promise<void> {
    this.isInitialized = false;
    await this.initializeIndex();
  }

  /**
   * インデックスの統計情報を取得
   */
  async getStats(): Promise<{
    memoryUsage?: number;
    lastUpdated?: Date;
  }> {
    return {
      memoryUsage: process.memoryUsage().heapUsed,
      lastUpdated: new Date(),
    };
  }

  /**
   * インデックスが初期化されているかチェック
   */
  isReady(): boolean {
    return this.isInitialized && this.wordIndex !== null;
  }

  /**
   * リソースをクリーンアップ
   */
  async dispose(): Promise<void> {
    if (this.wordIndex) {
      this.wordIndex = null;
    }
    this.isInitialized = false;
  }
}
