import crypto from 'crypto';

/**
 * 検索結果の型定義
 */
export interface SearchResult {
  id: string;
  score: number; // 0-1の正規化されたスコア
  snippet: string; // 周辺120文字程度のスニペット
  payload: {
    file: string;
    start: number;
    end: number;
    tags?: string[];
  };
}

/**
 * インデックスに追加するチャンクのクラス定義
 */
export class Chunk {
  constructor(
    public title: string, // 章・節タイトル
    public content: string, // チャンク本文
    public relativeFilePath: string, // プロジェクトルートからの相対パス (例: "sample_novel/contents/chapter_1.txt")
    public startLine: number, // 開始行番号
    public endLine: number, // 終了行番号
    public chunkIndex: number, // チャンク番号
    public novelId: string, // 小説プロジェクトID
    public fileType?: 'content' | 'settings', // ファイルタイプ
    public tags?: string[], // オプションのタグ
  ) {}

  /**
   * ベースID（ハッシュなし）を取得
   */
  get baseId(): string {
    return `${this.relativeFilePath}::${this.startLine}-${this.endLine}::chunk-${this.chunkIndex}`;
  }

  /**
   * チャンクIDを生成（ハッシュ付き）
   */
  get id(): string {
    return `${this.baseId}@${this.hash}`;
  }

  /**
   * タイトルとコンテンツのハッシュを生成
   */
  get hash(): string {
    const combined = this.title + '\n' + this.content;
    return crypto.createHash('md5').update(combined, 'utf8').digest('hex').substring(0, 8);
  }
}

/**
 * 検索バックエンドの抽象インターフェース
 */
export abstract class SearchBackend {
  /**
   * チャンクをインデックスに追加
   * @param chunks 追加するチャンクの配列
   */
  abstract add(chunks: Chunk[]): Promise<void>;

  /**
   * チャンクを差分更新（ハッシュ値による重複チェック）
   * @param chunks 更新するチャンクの配列
   * @returns 追加・更新・変更なしの件数
   */
  abstract updateChunks(chunks: Chunk[]): Promise<{
    added: number;
    updated: number;
    unchanged: number;
  }>;

  /**
   * 指定ファイルに関連するチャンクをすべて削除
   * @param relativeFilePath 削除対象のファイルパス（プロジェクトルートからの相対パス）
   */
  abstract removeByFile(relativeFilePath: string): Promise<void>;

  /**
   * 指定小説プロジェクトに関連するチャンクをすべて削除
   * @param novelId 削除対象の小説プロジェクトID
   */
  abstract removeByNovel(novelId: string): Promise<void>;

  /**
   * 検索を実行
   * @param query 検索クエリ
   * @param k 返す結果の最大数
   * @param novelId 検索対象の小説ID
   * @returns 検索結果の配列
   */
  abstract search(query: string, k: number, novelId: string): Promise<SearchResult[]>;

  /**
   * インデックスをクリア
   */
  abstract clear(): Promise<void>;

  /**
   * インデックスの統計情報を取得
   */
  abstract getStats(): Promise<{
    memoryUsage?: number;
    lastUpdated?: Date;
  }>;
}
