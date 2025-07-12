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
 * インデックスに追加するチャンクの型定義
 */
export interface Chunk {
  id: string; // file::section::para-N::chunk-M[@hash] 形式
  title: string; // 章・節タイトル
  content: string; // チャンク本文
  tags?: string[]; // オプションのタグ
  metadata?: {
    file: string;
    start: number;
    end: number;
  };
}

/**
 * 検索バックエンドの抽象インターフェース
 * フェーズ1: FlexSearchを使用
 * フェーズ2: Qdrantハイブリッド検索を追加
 */
export abstract class SearchBackend {
  /**
   * チャンクをインデックスに追加
   * @param chunks 追加するチャンクの配列
   */
  abstract add(chunks: Chunk[]): Promise<void>;

  /**
   * チャンクをインデックスから削除
   * @param ids 削除するチャンクのID配列
   */
  abstract remove(ids: string[]): Promise<void>;

  /**
   * 検索を実行
   * @param query 検索クエリ
   * @param k 返す結果の最大数
   * @returns 検索結果の配列
   */
  abstract search(query: string, k: number): Promise<SearchResult[]>;

  /**
   * インデックスをエクスポート（永続化）
   * @param path エクスポート先のパス
   */
  abstract exportIndex(path: string): Promise<void>;

  /**
   * インデックスをインポート（復元）
   * @param path インポート元のパス
   */
  abstract importIndex(path: string): Promise<void>;

  /**
   * インデックスをクリア
   */
  abstract clear(): Promise<void>;

  /**
   * インデックスの統計情報を取得
   */
  abstract getStats(): Promise<{
    totalChunks: number;
    memoryUsage?: number;
    lastUpdated?: Date;
  }>;
}
