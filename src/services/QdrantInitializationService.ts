import { getLogger } from '../logging/index.js';
import { DialogoiConfig } from '../lib/config.js';
import { QdrantVectorRepository } from '../repositories/QdrantVectorRepository.js';
import { DialogoiError } from '../errors/index.js';
import { DockerManager } from '../lib/dockerManager.js';

const logger = getLogger();

/**
 * Qdrant 初期化の結果
 */
export interface QdrantInitializationResult {
  success: boolean;
  repository?: QdrantVectorRepository;
  mode: 'explicit' | 'docker' | 'fallback';
  error?: Error;
  containerId?: string;
}

/**
 * Qdrant の段階的初期化を管理するサービス
 */
export class QdrantInitializationService {
  private config: DialogoiConfig;
  private activeContainerId?: string;
  private dockerManager: DockerManager;

  constructor(config: DialogoiConfig) {
    this.config = config;
    this.dockerManager = new DockerManager(config);
  }

  /**
   * 段階的初期化の実行
   */
  async initialize(): Promise<QdrantInitializationResult> {
    logger.info('Qdrant 初期化を開始します');

    // Phase 1: 明示的な接続先が設定されている場合のみ試行
    if (this.config.qdrant.url) {
      logger.info('明示的な接続先が設定されています', { url: this.config.qdrant.url });
      const explicitResult = await this.tryExplicitConnection();
      if (explicitResult.success) {
        logger.info('明示的な接続先への接続に成功しました');
        return explicitResult;
      }
      logger.info('明示的な接続先への接続に失敗しました', {
        error: explicitResult.error?.message,
      });
    } else {
      logger.info('明示的な接続先は設定されていません。Docker自動起動を試行します');
    }

    // Phase 2: Docker自動起動を試行
    if (this.config.qdrant.docker.enabled) {
      logger.info('Docker自動起動を試行中...', { enabled: this.config.qdrant.docker.enabled });
      const dockerResult = await this.tryDockerAutoStart();
      if (dockerResult.success) {
        logger.info('Docker自動起動による接続に成功しました');
        return dockerResult;
      } else {
        logger.info('Docker自動起動に失敗しました', { error: dockerResult.error?.message });
      }
    } else {
      logger.info('Docker自動起動は無効化されています', {
        enabled: this.config.qdrant.docker.enabled,
      });
    }

    // Phase 3: フォールバック
    logger.warn('Qdrant接続に失敗しました。文字列検索モードで動作します');
    return {
      success: false,
      mode: 'fallback',
      error: new DialogoiError('Qdrant接続に失敗しました', 'QDRANT_CONNECTION_FAILED', {
        hasExplicitUrl: !!this.config.qdrant.url,
        dockerEnabled: this.config.qdrant.docker.enabled,
      }),
    };
  }

  /**
   * Phase 1: 明示的な接続先を試行
   */
  private async tryExplicitConnection(): Promise<QdrantInitializationResult> {
    try {
      if (!this.config.qdrant.url) {
        return {
          success: false,
          mode: 'explicit',
          error: new Error('明示的なURLが設定されていません'),
        };
      }

      logger.debug('明示的な接続先を試行中', { url: this.config.qdrant.url });

      const repository = new QdrantVectorRepository({
        url: this.config.qdrant.url,
        apiKey: this.config.qdrant.apiKey,
        timeout: this.config.qdrant.timeout,
        defaultCollection: this.config.qdrant.collection,
      });

      // 接続テスト
      await repository.connect();
      await repository.disconnect();

      logger.info('明示的な接続先への接続に成功しました');
      return {
        success: true,
        repository,
        mode: 'explicit',
      };
    } catch (error) {
      logger.debug('明示的な接続先への接続に失敗しました', { error: (error as Error).message });
      return {
        success: false,
        mode: 'explicit',
        error: error as Error,
      };
    }
  }

  /**
   * Phase 2: Docker自動起動を試行（新設計）
   */
  private async tryDockerAutoStart(): Promise<QdrantInitializationResult> {
    try {
      logger.debug('Docker自動起動を試行中');

      // DockerManagerを使用してコンテナを確保
      const containerReady = await this.dockerManager.ensureQdrantContainer();
      if (!containerReady) {
        return {
          success: false,
          mode: 'docker',
          error: new Error('Qdrantコンテナの確保に失敗しました'),
        };
      }

      // コンテナの健全性を確認
      const containerName = this.config.docker.qdrant.containerName;
      const port = this.config.docker.qdrant.port;

      const healthCheck = await this.dockerManager.waitForContainerHealth(containerName, port);
      if (!healthCheck) {
        return {
          success: false,
          mode: 'docker',
          error: new Error('Qdrantヘルスチェックに失敗しました'),
        };
      }

      // 接続テスト
      const repository = new QdrantVectorRepository({
        url: this.config.qdrant.url || `http://localhost:${port}`,
        apiKey: this.config.qdrant.apiKey,
        timeout: this.config.qdrant.timeout,
        defaultCollection: this.config.qdrant.collection,
      });

      await repository.connect();
      await repository.disconnect();

      // コンテナIDを取得
      const containerInfo = await this.dockerManager.getContainerInfo(containerName);
      this.activeContainerId = containerInfo?.id;

      logger.info('Docker自動起動による接続に成功しました', {
        containerName,
        containerId: this.activeContainerId,
      });

      return {
        success: true,
        repository,
        mode: 'docker',
        containerId: this.activeContainerId,
      };
    } catch (error) {
      logger.debug('Docker自動起動に失敗しました', { error: (error as Error).message });
      return {
        success: false,
        mode: 'docker',
        error: error as Error,
      };
    }
  }

  /**
   * アクティブなコンテナをクリーンアップ（新設計では不要だが、互換性のため残す）
   */
  async cleanup(): Promise<void> {
    // 新設計では永続的なコンテナを使用するため、クリーンアップは行わない
    logger.info('新設計ではDockerコンテナは永続的に利用されます');
  }
}
