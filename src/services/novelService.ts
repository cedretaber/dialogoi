import { NovelRepository } from '../repositories/NovelRepository.js';
import { SearchService } from './SearchService.js';
import { FileOperationsService } from './FileOperationsService.js';
import { getLogger } from '../logging/index.js';

/**
 * 小説プロジェクト管理サービス（リファクタリング後）
 */
export class NovelService {
  private readonly novelRepository: NovelRepository;
  private readonly searchService: SearchService;
  private readonly fileOperationsService: FileOperationsService;
  private readonly logger = getLogger();

  constructor(
    novelRepository: NovelRepository,
    searchService: SearchService,
    fileOperationsService: FileOperationsService,
  ) {
    this.novelRepository = novelRepository;
    this.searchService = searchService;
    this.fileOperationsService = fileOperationsService;
    this.logger.debug('NovelService初期化完了（リファクタリング版）');
  }

  /**
   * RAG検索を実行
   * @param novelId 小説ID
   * @param query 検索クエリ
   * @param k 取得する結果数
   * @returns 検索結果
   */
  async searchRag(novelId: string, query: string, k: number) {
    return this.searchService.searchRag(novelId, query, { k });
  }

  /**
   * ファイル監視を開始
   */
  async startFileWatching(): Promise<void> {
    await this.searchService.startFileWatching();
  }

  /**
   * ファイル監視を停止
   */
  async stopFileWatching(): Promise<void> {
    await this.searchService.stopFileWatching();
  }

  /**
   * 検索バックエンドを初期化（サーバー起動時に呼び出し）
   */
  async initialize(): Promise<void> {
    await this.searchService.initialize();
  }

  /**
   * クリーンアップ処理（Docker コンテナ等のリソースを含む）
   */
  async cleanup(): Promise<void> {
    await this.searchService.cleanup();
  }

  /**
   * ファイル監視の状態を取得
   */
  isFileWatching(): boolean {
    return this.searchService.isFileWatching();
  }

  // 小説プロジェクト一覧を取得
  async listNovelProjects(): Promise<Array<{ id: string; title: string; description?: string }>> {
    return this.novelRepository.listProjects();
  }

  async listNovelSettings(novelId: string): Promise<Array<{ filename: string; preview: string }>> {
    return this.novelRepository.listSettingsFiles(novelId);
  }

  async getNovelSettings(novelId: string, filename?: string): Promise<string> {
    return this.novelRepository.getSettingsContent(novelId, filename);
  }

  async searchNovelSettings(
    novelId: string,
    keyword: string,
    useRegex: boolean = false,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>> {
    return this.searchService.searchSettingsFiles(novelId, keyword, { useRegex });
  }

  async searchNovelContent(
    novelId: string,
    keyword: string,
    useRegex: boolean = false,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>> {
    return this.searchService.searchContentFiles(novelId, keyword, { useRegex });
  }

  async getNovelContent(novelId: string, filename?: string): Promise<string> {
    return this.novelRepository.getContentFiles(novelId, filename);
  }

  // 本文ファイル一覧を取得
  async listNovelContent(novelId: string): Promise<Array<{ filename: string; preview: string }>> {
    return this.novelRepository.listContentFiles(novelId);
  }

  // ===== 指示ファイル（AI Instructions）操作 =====

  /**
   * プロジェクト配下の指示ファイル一覧（プレビュー付き）を取得
   */
  async listNovelInstructions(
    novelId: string,
  ): Promise<Array<{ filename: string; preview: string }>> {
    return this.novelRepository.listInstructionFiles(novelId);
  }

  /**
   * 指示ファイルの内容を取得
   * filename を省略すると候補ファイルをすべて結合して返す
   */
  async getNovelInstructions(novelId: string, filename?: string): Promise<string> {
    return this.novelRepository.getInstructionFiles(novelId, filename);
  }

  // 設定ファイルを追加
  async addNovelSetting(
    novelId: string,
    directory: string,
    filename: string,
    content: string,
    overwrite: boolean = false,
  ): Promise<void> {
    await this.fileOperationsService.createSettingsFile(novelId, directory, filename, content, {
      overwrite,
    });
  }

  // 本文ファイルを追加
  async addNovelContent(
    novelId: string,
    directory: string,
    filename: string,
    content: string,
    overwrite: boolean = false,
  ): Promise<void> {
    await this.fileOperationsService.createContentFile(novelId, directory, filename, content, {
      overwrite,
    });
  }
}
