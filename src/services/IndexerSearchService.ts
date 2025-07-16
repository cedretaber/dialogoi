import { SearchService, SearchOptions, KeywordSearchResult } from './SearchService.js';
import { SearchResult } from '../backends/SearchBackend.js';
import { NovelRepository } from '../repositories/NovelRepository.js';
import { IndexerManager } from '../lib/indexerManager.js';
import { ConfigurationError } from '../errors/index.js';
import { getLogger } from '../logging/index.js';

/**
 * IndexerManagerベースの検索サービス実装
 */
export class IndexerSearchService implements SearchService {
  private readonly novelRepository: NovelRepository;
  private indexerManager?: IndexerManager;
  private readonly logger = getLogger();

  constructor(novelRepository: NovelRepository, indexerManager?: IndexerManager) {
    this.novelRepository = novelRepository;
    this.indexerManager = indexerManager;
    this.logger.debug('IndexerSearchService初期化');
  }

  /**
   * IndexerManagerを設定（後方互換性のため）
   */
  setIndexerManager(indexerManager: IndexerManager): void {
    this.indexerManager = indexerManager;
    this.logger.debug('IndexerManager設定');
  }

  async searchRag(
    projectId: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    if (!this.indexerManager) {
      throw new ConfigurationError(
        'IndexerManager が設定されていません',
        'INDEXER_MANAGER_NOT_CONFIGURED',
      );
    }

    const k = options?.k || 10;
    this.logger.debug('RAG検索実行', { projectId, query, k });
    return this.indexerManager.search(projectId, query, k);
  }

  async searchSettingsFiles(
    projectId: string,
    keyword: string,
    options?: SearchOptions,
  ): Promise<KeywordSearchResult[]> {
    const useRegex = options?.useRegex || false;
    this.logger.debug('設定ファイル検索実行', { projectId, keyword, useRegex });
    return this.novelRepository.searchSettingsFiles(projectId, keyword, useRegex);
  }

  async searchContentFiles(
    projectId: string,
    keyword: string,
    options?: SearchOptions,
  ): Promise<KeywordSearchResult[]> {
    const useRegex = options?.useRegex || false;
    this.logger.debug('本文ファイル検索実行', { projectId, keyword, useRegex });
    return this.novelRepository.searchContentFiles(projectId, keyword, useRegex);
  }

  async startFileWatching(): Promise<void> {
    if (!this.indexerManager) {
      throw new ConfigurationError(
        'IndexerManager が設定されていません',
        'INDEXER_MANAGER_NOT_CONFIGURED',
      );
    }
    this.logger.info('ファイル監視開始');
    await this.indexerManager.startFileWatching();
  }

  async stopFileWatching(): Promise<void> {
    if (!this.indexerManager) {
      throw new ConfigurationError(
        'IndexerManager が設定されていません',
        'INDEXER_MANAGER_NOT_CONFIGURED',
      );
    }
    this.logger.info('ファイル監視停止');
    await this.indexerManager.stopFileWatching();
  }

  isFileWatching(): boolean {
    if (!this.indexerManager) {
      return false;
    }
    return this.indexerManager.isFileWatching();
  }

  async initialize(): Promise<void> {
    if (!this.indexerManager) {
      throw new ConfigurationError(
        'IndexerManager が設定されていません',
        'INDEXER_MANAGER_NOT_CONFIGURED',
      );
    }
    this.logger.info('検索バックエンド初期化開始（サーバー起動時）');
    await this.indexerManager.initializeQdrant();
  }

  async cleanup(): Promise<void> {
    if (!this.indexerManager) {
      throw new ConfigurationError(
        'IndexerManager が設定されていません',
        'INDEXER_MANAGER_NOT_CONFIGURED',
      );
    }
    this.logger.info('クリーンアップ処理開始');
    await this.indexerManager.cleanup();
  }
}
