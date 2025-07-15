import path from 'path';
import { FileOperationsService, FileCreationOptions } from './FileOperationsService.js';
import { NovelRepository } from '../repositories/NovelRepository.js';
import { IndexerManager } from '../lib/indexerManager.js';
import { getLogger } from '../logging/index.js';

/**
 * IndexerManager連携のファイル操作サービス実装
 */
export class IndexerFileOperationsService implements FileOperationsService {
  private readonly novelRepository: NovelRepository;
  private indexerManager?: IndexerManager;
  private readonly logger = getLogger();

  constructor(novelRepository: NovelRepository, indexerManager?: IndexerManager) {
    this.novelRepository = novelRepository;
    this.indexerManager = indexerManager;
    this.logger.debug('IndexerFileOperationsService初期化');
  }

  /**
   * IndexerManagerを設定（後方互換性のため）
   */
  setIndexerManager(indexerManager: IndexerManager): void {
    this.indexerManager = indexerManager;
    this.logger.debug('IndexerManager設定');
  }

  async createSettingsFile(
    projectId: string,
    directory: string,
    filename: string,
    content: string,
    options?: FileCreationOptions,
  ): Promise<void> {
    const overwrite = options?.overwrite || false;

    await this.novelRepository.createSettingsFile(
      projectId,
      directory,
      filename,
      content,
      overwrite,
    );

    // インデックス更新
    const project = await this.novelRepository.getProject(projectId);
    const filePath = path.join(project.path, directory, filename);
    await this.notifyFileUpdate(projectId, filePath);

    this.logger.info('設定ファイル作成完了', { projectId, directory, filename });
  }

  async createContentFile(
    projectId: string,
    directory: string,
    filename: string,
    content: string,
    options?: FileCreationOptions,
  ): Promise<void> {
    const overwrite = options?.overwrite || false;

    await this.novelRepository.createContentFile(
      projectId,
      directory,
      filename,
      content,
      overwrite,
    );

    // インデックス更新
    const project = await this.novelRepository.getProject(projectId);
    const filePath = path.join(project.path, directory, filename);
    await this.notifyFileUpdate(projectId, filePath);

    this.logger.info('本文ファイル作成完了', { projectId, directory, filename });
  }

  async notifyFileUpdate(projectId: string, filePath: string): Promise<void> {
    if (this.indexerManager) {
      try {
        await this.indexerManager.updateFile(projectId, filePath);
        this.logger.debug('インデックス更新完了', { projectId, filePath });
      } catch (error) {
        this.logger.error('インデックス更新エラー', error as Error, { projectId, filePath });
      }
    } else {
      this.logger.debug('IndexerManager未設定のためインデックス更新スキップ', {
        projectId,
        filePath,
      });
    }
  }
}
