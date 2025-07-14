import { Indexer } from '../indexer.js';
import { DialogoiConfig } from './config.js';
import { SearchResult } from '../backends/SearchBackend.js';
import { FileWatcher, FileChangeEvent, createDefaultFileWatcherConfig } from './fileWatcher.js';

/**
 * 単一のIndexerで複数の小説プロジェクトを管理するクラス
 * ファイル監視機能も統合している
 */
export class IndexerManager {
  private indexer: Indexer;
  private initializedNovels: Set<string> = new Set();
  private config: DialogoiConfig;
  private fileWatcher: FileWatcher | null = null;

  constructor(config: DialogoiConfig) {
    this.config = config;
    // 単一のIndexerを作成
    this.indexer = new Indexer(this.config);
  }

  /**
   * 指定された小説IDの初期化確認・実行
   * @param novelId 小説ID
   */
  private async ensureNovelInitialized(novelId: string): Promise<void> {
    if (!this.initializedNovels.has(novelId)) {
      console.error(`📚 小説プロジェクトのインデックスを構築: ${novelId}`);
      await this.indexer.indexNovel(novelId);
      this.initializedNovels.add(novelId);
    }
  }

  /**
   * 指定された小説IDが初期化済みかチェック
   * @param novelId 小説ID
   * @returns 初期化済みの場合はtrue
   */
  hasInitialized(novelId: string): boolean {
    return this.initializedNovels.has(novelId);
  }

  /**
   * 指定された小説IDの初期化状態をクリア
   * @param novelId 小説ID
   */
  async clearNovelIndex(novelId: string): Promise<void> {
    if (this.initializedNovels.has(novelId)) {
      await this.indexer.removeNovelFromIndex(novelId);
      this.initializedNovels.delete(novelId);
      console.error(`🗑️ 小説プロジェクトのインデックスを削除: ${novelId}`);
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
    await this.ensureNovelInitialized(novelId);
    return this.indexer.search(query, k, novelId);
  }

  /**
   * 指定された小説IDのファイルを更新
   * @param novelId 小説ID
   * @param filePath ファイルパス
   */
  async updateFile(novelId: string, filePath: string): Promise<void> {
    await this.ensureNovelInitialized(novelId);
    await this.indexer.updateFile(filePath, novelId);
  }

  /**
   * 指定された小説IDのファイルを削除
   * @param novelId 小説ID
   * @param filePath ファイルパス
   */
  async removeFile(novelId: string, filePath: string): Promise<void> {
    await this.ensureNovelInitialized(novelId);
    await this.indexer.removeFile(filePath);
  }

  /**
   * 指定された小説IDのインデックスを再構築
   * @param novelId 小説ID
   */
  async rebuildIndex(novelId: string): Promise<void> {
    await this.clearNovelIndex(novelId);
    await this.ensureNovelInitialized(novelId);
  }

  /**
   * 初期化済み小説一覧を取得
   * @returns 小説IDのリスト
   */
  getInitializedNovels(): string[] {
    return Array.from(this.initializedNovels);
  }

  /**
   * 統計情報を取得
   * @returns 初期化済み小説数と詳細情報
   */
  getStats(): {
    totalInitializedNovels: number;
    novels: Array<{
      novelId: string;
      isInitialized: boolean;
    }>;
  } {
    const novels = Array.from(this.initializedNovels).map((novelId) => ({
      novelId,
      isInitialized: true,
    }));

    return {
      totalInitializedNovels: this.initializedNovels.size,
      novels,
    };
  }

  /**
   * ファイル監視を開始
   */
  async startFileWatching(): Promise<void> {
    if (this.fileWatcher) {
      console.error('⚠️  ファイル監視は既に開始されています');
      return;
    }

    const watcherConfig = createDefaultFileWatcherConfig(this.config.projectRoot);
    this.fileWatcher = new FileWatcher(watcherConfig);

    // ファイル変更イベントを監視
    this.fileWatcher.on('fileChange', async (event: FileChangeEvent) => {
      await this.handleFileChange(event);
    });

    this.fileWatcher.on('error', (error: Error) => {
      console.error('❌ ファイル監視エラー:', error);
    });

    await this.fileWatcher.start();
  }

  /**
   * ファイル監視を停止
   */
  async stopFileWatching(): Promise<void> {
    if (this.fileWatcher) {
      await this.fileWatcher.stop();
      this.fileWatcher = null;
    }
  }

  /**
   * ファイル監視の状態を取得
   */
  isFileWatching(): boolean {
    return this.fileWatcher?.getWatchingStatus() || false;
  }

  /**
   * ファイル変更イベントを処理
   */
  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'add':
        case 'change':
          await this.updateFile(event.novelId, event.filePath);
          break;
        case 'unlink':
          await this.removeFile(event.novelId, event.filePath);
          break;
      }
    } catch (error) {
      console.error(`❌ ファイル変更処理エラー (${event.type}): ${event.filePath}`, error);
    }
  }

  /**
   * クリーンアップ時にファイル監視も停止
   */
  async cleanup(): Promise<void> {
    await this.stopFileWatching();
    await this.indexer.cleanup();
    this.initializedNovels.clear();
    console.error('🧹 全てのインデックスをクリーンアップしました');
  }
}
