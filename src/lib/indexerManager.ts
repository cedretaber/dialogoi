import { Indexer } from '../indexer.js';
import { DialogoiConfig } from './config.js';
import { SearchResult } from '../backends/SearchBackend.js';
import { FileWatcher, FileChangeEvent, createDefaultFileWatcherConfig } from './fileWatcher.js';
import {
  QdrantInitializationService,
  QdrantInitializationResult,
} from '../services/QdrantInitializationService.js';
import { SearchBackendUnavailableError } from '../errors/DialogoiError.js';
import { getLogger } from '../logging/index.js';

/**
 * 単一のIndexerで複数の小説プロジェクトを管理するクラス
 * ファイル監視機能も統合している
 */
export class IndexerManager {
  private indexer: Indexer;
  private initializedNovels: Set<string> = new Set();
  private config: DialogoiConfig;
  private fileWatcher: FileWatcher | null = null;
  private qdrantInitService: QdrantInitializationService;
  private initializationResult: QdrantInitializationResult | null = null;
  private logger = getLogger();

  constructor(config: DialogoiConfig) {
    this.config = config;
    this.qdrantInitService = new QdrantInitializationService(config);
    // 単一のIndexerを作成
    this.indexer = new Indexer(this.config);
  }

  /**
   * Qdrant 初期化を実行
   */
  async initializeQdrant(): Promise<QdrantInitializationResult> {
    if (!this.initializationResult) {
      this.logger.info('Qdrant 初期化を実行中...');
      this.initializationResult = await this.qdrantInitService.initialize();

      if (this.initializationResult.success) {
        this.logger.info('Qdrant 初期化に成功しました', {
          mode: this.initializationResult.mode,
          containerId: this.initializationResult.containerId,
        });
      } else {
        this.logger.warn('Qdrant 初期化に失敗しました。フォールバックモードで動作します', {
          mode: this.initializationResult.mode,
          error: this.initializationResult.error?.message,
        });
      }
    }

    return this.initializationResult;
  }

  /**
   * Qdrant が利用可能かチェック
   */
  isQdrantAvailable(): boolean {
    return this.initializationResult?.success ?? false;
  }

  /**
   * 指定された小説IDの初期化確認・実行
   * @param novelId 小説ID
   */
  private async ensureNovelInitialized(novelId: string): Promise<void> {
    if (!this.initializedNovels.has(novelId)) {
      this.logger.info(`📚 小説プロジェクトのインデックスを構築: ${novelId}`);
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
      this.logger.info(`🗑️ 小説プロジェクトのインデックスを削除: ${novelId}`);
    }
  }

  /**
   * 検索を実行
   * @param novelId 小説ID
   * @param query 検索クエリ
   * @param k 取得する結果数
   * @returns 検索結果
   */
  async search(
    novelId: string,
    query: string,
    k: number,
    fileType?: string,
  ): Promise<SearchResult[]> {
    // fileTypeのバリデーション
    if (fileType && !['content', 'settings', 'both'].includes(fileType)) {
      throw new Error(`Invalid fileType: ${fileType}. Must be one of: content, settings, both`);
    }

    this.logger.debug('RAG検索開始', {
      novelId,
      query,
      k,
      fileType,
      hasInitializationResult: !!this.initializationResult,
      initializationResultSuccess: this.initializationResult?.success,
    });

    // Qdrant 初期化を確認（未初期化の場合のみ実行）
    if (!this.initializationResult) {
      this.logger.warn('初期化結果が未設定のため、再初期化を実行します');
      const initResult = await this.initializeQdrant();
      if (!initResult.success) {
        this.logger.warn('Qdrant が利用できません。エラーをthrowします', {
          novelId,
          query,
          mode: initResult.mode,
          error: initResult.error?.message,
        });
        throw new SearchBackendUnavailableError(
          query,
          'Qdrantベクターデータベースに接続できないため、セマンティック検索を実行できません',
          {
            novelId,
            mode: initResult.mode,
            error: initResult.error?.message,
          },
        );
      }
    }

    // 既に初期化されているが失敗していた場合
    if (this.initializationResult && !this.initializationResult.success) {
      this.logger.warn('Qdrant が利用できません。エラーをthrowします', {
        novelId,
        query,
        mode: this.initializationResult.mode,
        error: this.initializationResult.error?.message,
      });
      throw new SearchBackendUnavailableError(
        query,
        'Qdrantベクターデータベースに接続できないため、セマンティック検索を実行できません',
        {
          novelId,
          mode: this.initializationResult.mode,
          error: this.initializationResult.error?.message,
        },
      );
    }

    // フォールバックモード用の早期リターン（テスト用途）
    if (this.initializationResult?.mode === 'fallback') {
      this.logger.debug('フォールバックモードのためエラーをthrowします', { novelId, query });
      throw new SearchBackendUnavailableError(
        query,
        'Qdrantベクターデータベースに接続できないため、セマンティック検索を実行できません（フォールバックモード）',
        {
          novelId,
          mode: this.initializationResult.mode,
        },
      );
    }

    await this.ensureNovelInitialized(novelId);
    return this.indexer.search(query, k, novelId, fileType);
  }

  /**
   * 指定された小説IDのファイルを更新
   * @param novelId 小説プロジェクトID
   * @param filePath 更新対象ファイルの絶対パス
   */
  async updateFile(novelId: string, filePath: string): Promise<void> {
    // 初期化されていない場合のみ初期化を実行
    if (!this.initializedNovels.has(novelId)) {
      await this.ensureNovelInitialized(novelId);
      return; // 初期化で全ファイルが既にインデックスされているため、個別のupdateFileは不要
    }

    await this.indexer.updateFile(filePath, novelId);
  }

  /**
   * 指定された小説IDのファイルを削除
   * @param novelId 小説プロジェクトID
   * @param filePath 削除対象ファイルの絶対パス
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
      this.logger.warn('⚠️  ファイル監視は既に開始されています');
      return;
    }

    const watcherConfig = createDefaultFileWatcherConfig(this.config.projectRoot);
    this.fileWatcher = new FileWatcher(watcherConfig);

    // ファイル変更イベントを監視
    this.fileWatcher.on('fileChange', async (event: FileChangeEvent) => {
      await this.handleFileChange(event);
    });

    this.fileWatcher.on('error', (error: Error) => {
      this.logger.error('❌ ファイル監視エラー:', error);
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
      this.logger.error(`❌ ファイル変更処理エラー (${event.type}): ${event.filePath}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * クリーンアップ時にファイル監視も停止
   */
  async cleanup(): Promise<void> {
    await this.stopFileWatching();
    await this.indexer.cleanup();
    await this.qdrantInitService.cleanup();
    this.initializedNovels.clear();
    this.logger.info('🧹 全てのインデックスをクリーンアップしました');
  }
}
