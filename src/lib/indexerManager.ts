import { Indexer } from '../indexer.js';
import { DialogoiConfig } from './config.js';
import { SearchResult } from '../backends/SearchBackend.js';

/**
 * 複数の小説プロジェクトのIndexerを管理するクラス
 */
export class IndexerManager {
  private indexers: Map<string, Indexer> = new Map();
  private config: DialogoiConfig;

  constructor(config: DialogoiConfig) {
    this.config = config;
  }

  /**
   * 指定された小説IDのIndexerを取得または作成
   * @param novelId 小説ID
   * @returns Indexer インスタンス
   */
  async getOrCreateIndexer(novelId: string): Promise<Indexer> {
    if (!this.indexers.has(novelId)) {
      console.error(`📚 新しい小説プロジェクトのIndexerを作成: ${novelId}`);
      const indexer = new Indexer(this.config, novelId);
      await indexer.initialize();
      this.indexers.set(novelId, indexer);
    }

    return this.indexers.get(novelId)!;
  }

  /**
   * 指定された小説IDのIndexerが存在するかチェック
   * @param novelId 小説ID
   * @returns 存在する場合はtrue
   */
  hasIndexer(novelId: string): boolean {
    return this.indexers.has(novelId);
  }

  /**
   * 指定された小説IDのIndexerを削除
   * @param novelId 小説ID
   */
  async removeIndexer(novelId: string): Promise<void> {
    const indexer = this.indexers.get(novelId);
    if (indexer) {
      await indexer.cleanup();
      this.indexers.delete(novelId);
      console.error(`🗑️ 小説プロジェクトのIndexerを削除: ${novelId}`);
    }
  }

  /**
   * 検索を実行
   * @param novelId 小説ID
   * @param query 検索クエリ
   * @param k 取得する結果数
   * @returns 検索結果
   */
  async search(novelId: string, query: string, k: number): Promise<SearchResult[]> {
    const indexer = await this.getOrCreateIndexer(novelId);
    return indexer.search(query, k, novelId);
  }

  /**
   * 指定された小説IDのファイルを更新
   * @param novelId 小説ID
   * @param filePath ファイルパス
   */
  async updateFile(novelId: string, filePath: string): Promise<void> {
    const indexer = await this.getOrCreateIndexer(novelId);
    await indexer.updateFile(filePath);
  }

  /**
   * 指定された小説IDのファイルを削除
   * @param novelId 小説ID
   * @param filePath ファイルパス
   */
  async removeFile(novelId: string, filePath: string): Promise<void> {
    const indexer = await this.getOrCreateIndexer(novelId);
    await indexer.removeFile(filePath);
  }

  /**
   * 指定された小説IDのインデックスを再構築
   * @param novelId 小説ID
   */
  async rebuildIndex(novelId: string): Promise<void> {
    const indexer = await this.getOrCreateIndexer(novelId);
    await indexer.buildFullIndex();
  }

  /**
   * 全てのIndexerをクリーンアップ
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.indexers.values()).map((indexer) => indexer.cleanup());
    await Promise.all(cleanupPromises);
    this.indexers.clear();
    console.error('🧹 全てのIndexerをクリーンアップしました');
  }

  /**
   * 管理中のIndexer一覧を取得
   * @returns 小説IDのリスト
   */
  getIndexerList(): string[] {
    return Array.from(this.indexers.keys());
  }

  /**
   * 統計情報を取得
   * @returns 管理中のIndexer数と詳細情報
   */
  getStats(): {
    totalIndexers: number;
    indexers: Array<{
      novelId: string;
      isReady: boolean;
    }>;
  } {
    const indexers = Array.from(this.indexers.entries()).map(([novelId, indexer]) => ({
      novelId,
      isReady: indexer.isReady(),
    }));

    return {
      totalIndexers: this.indexers.size,
      indexers,
    };
  }
}
