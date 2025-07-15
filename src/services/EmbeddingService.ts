/**
 * Embedding生成サービスのインターフェース
 * テキストをベクトル表現に変換する機能を提供
 */
export interface EmbeddingService {
  /**
   * 単一のテキストをembeddingベクトルに変換
   * @param text 変換するテキスト
   * @returns embedding ベクトル（数値配列）
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * 複数のテキストを一括でembeddingベクトルに変換（バッチ処理）
   * @param texts 変換するテキストの配列
   * @returns embedding ベクトルの配列
   */
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * embeddingベクトルの次元数を取得
   * @returns ベクトルの次元数
   */
  getDimensions(): number;

  /**
   * サービスが初期化済みで利用可能かを確認
   * @returns 利用可能な場合はtrue
   */
  isReady(): boolean;

  /**
   * サービスを初期化（モデルのロードなど）
   * 既に初期化済みの場合は何もしない
   */
  initialize(): Promise<void>;

  /**
   * リソースをクリーンアップ
   */
  dispose(): Promise<void>;
}

/**
 * Embedding生成時のオプション
 */
export interface EmbeddingOptions {
  /**
   * 正規化を行うか（デフォルト: true）
   */
  normalize?: boolean;

  /**
   * バッチサイズ（デフォルト: 32）
   */
  batchSize?: number;

  /**
   * タイムアウト（ミリ秒、デフォルト: 30000）
   */
  timeout?: number;
}

/**
 * Embeddingサービスの設定
 */
export interface EmbeddingConfig {
  /**
   * 使用するモデル名
   */
  model: string;

  /**
   * embeddingの次元数
   */
  dimensions: number;

  /**
   * バッチ処理時のデフォルトサイズ
   */
  batchSize: number;

  /**
   * モデルのキャッシュディレクトリ（オプション）
   */
  cacheDir?: string;

  /**
   * GPU使用設定（オプション）
   */
  device?: 'cpu' | 'gpu';
}
