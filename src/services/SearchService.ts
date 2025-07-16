import { SearchResult } from '../backends/SearchBackend.js';

/**
 * 検索オプション
 */
export interface SearchOptions {
  /** 取得する結果数 */
  k?: number;
  /** 正規表現を使用するか */
  useRegex?: boolean;
}

/**
 * キーワード検索結果
 */
export interface KeywordSearchResult {
  filename: string;
  matchingLines: string[];
}

/**
 * 検索機能を提供するサービス
 */
export interface SearchService {
  /**
   * RAG検索を実行
   * @param projectId プロジェクトID
   * @param query 検索クエリ
   * @param options 検索オプション
   */
  searchRag(projectId: string, query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * 設定ファイル内でキーワード検索
   * @param projectId プロジェクトID
   * @param keyword 検索キーワード
   * @param options 検索オプション
   */
  searchSettingsFiles(
    projectId: string,
    keyword: string,
    options?: SearchOptions,
  ): Promise<KeywordSearchResult[]>;

  /**
   * 本文ファイル内でキーワード検索
   * @param projectId プロジェクトID
   * @param keyword 検索キーワード
   * @param options 検索オプション
   */
  searchContentFiles(
    projectId: string,
    keyword: string,
    options?: SearchOptions,
  ): Promise<KeywordSearchResult[]>;

  /**
   * ファイル監視を開始
   */
  startFileWatching(): Promise<void>;

  /**
   * ファイル監視を停止
   */
  stopFileWatching(): Promise<void>;

  /**
   * ファイル監視の状態を取得
   */
  isFileWatching(): boolean;

  /**
   * 検索バックエンドを初期化（サーバー起動時に呼び出し）
   */
  initialize(): Promise<void>;

  /**
   * クリーンアップ処理（Docker コンテナ等のリソースを含む）
   */
  cleanup(): Promise<void>;
}
