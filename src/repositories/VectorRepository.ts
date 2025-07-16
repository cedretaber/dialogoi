/**
 * ベクトルデータベースへのアクセスを抽象化するリポジトリインターフェース
 * Qdrant、Pinecone、Weaviate等の異なるベクトルDBに対応可能
 */
export interface VectorRepository {
  /**
   * ベクトルデータベースへの接続を確立
   */
  connect(): Promise<void>;

  /**
   * 接続を閉じる
   */
  disconnect(): Promise<void>;

  /**
   * 接続状態を確認
   */
  isConnected(): boolean;

  /**
   * コレクションの存在確認と作成
   */
  ensureCollection(collectionName: string, vectorSize: number): Promise<void>;

  /**
   * ベクトルポイントの一括挿入・更新
   */
  upsertVectors(collectionName: string, vectors: VectorPoint[]): Promise<void>;

  /**
   * ベクトル検索
   */
  searchVectors(
    collectionName: string,
    queryVector: number[],
    limit: number,
    scoreThreshold?: number,
  ): Promise<VectorSearchResult[]>;

  /**
   * ベクトルポイントの削除
   */
  deleteVectors(collectionName: string, pointIds: string[]): Promise<void>;

  /**
   * ファイルパスによるベクトルポイントの削除
   * @param relativeFilePath プロジェクトルートからの相対パス
   */
  deleteVectorsByFilePath(collectionName: string, relativeFilePath: string): Promise<void>;

  /**
   * 小説IDによるベクトルポイントの削除
   */
  deleteVectorsByNovelId(collectionName: string, novelId: string): Promise<void>;

  /**
   * コレクションの削除
   */
  deleteCollection(collectionName: string): Promise<void>;

  /**
   * コレクション情報の取得
   */
  getCollectionInfo(collectionName: string): Promise<CollectionInfo>;
}

/**
 * ベクトルポイントのデータ構造
 */
export interface VectorPoint {
  /**
   * ポイントの一意識別子
   */
  id: string;

  /**
   * ベクトルデータ
   */
  vector: number[];

  /**
   * 関連するメタデータ
   */
  payload?: Record<string, unknown>;
}

/**
 * ベクトル検索結果
 */
export interface VectorSearchResult {
  /**
   * ポイントの一意識別子
   */
  id: string;

  /**
   * 類似度スコア
   */
  score: number;

  /**
   * 関連するメタデータ
   */
  payload?: Record<string, unknown>;

  /**
   * ベクトルデータ（オプション）
   */
  vector?: number[];
}

/**
 * コレクション情報
 */
export interface CollectionInfo {
  /**
   * コレクションの状態
   */
  status: string;

  /**
   * ベクトル数
   */
  vectorsCount: number;

  /**
   * インデックス済みベクトル数
   */
  indexedVectorsCount: number;

  /**
   * その他の情報
   */
  [key: string]: unknown;
}

/**
 * ベクトルリポジトリの設定
 */
export interface VectorRepositoryConfig {
  /**
   * データベースサーバーのURL（未設定の場合はDocker自動起動）
   */
  url?: string;

  /**
   * APIキー（オプション）
   */
  apiKey?: string;

  /**
   * タイムアウト時間（ミリ秒）
   */
  timeout: number;

  /**
   * デフォルトのコレクション名
   */
  defaultCollection: string;
}
