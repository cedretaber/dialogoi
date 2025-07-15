import { spawn } from 'child_process';
import { getLogger } from '../logging/index.js';
import { DialogoiConfig } from '../lib/config.js';
import { QdrantVectorRepository } from '../repositories/QdrantVectorRepository.js';
import { DialogoiError } from '../errors/index.js';

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

  constructor(config: DialogoiConfig) {
    this.config = config;
  }

  /**
   * 段階的初期化の実行
   */
  async initialize(): Promise<QdrantInitializationResult> {
    logger.info('Qdrant 初期化を開始します');

    // Phase 1: 明示的な接続先を試行
    const explicitResult = await this.tryExplicitConnection();
    if (explicitResult.success) {
      logger.info('明示的な接続先への接続に成功しました');
      return explicitResult;
    }

    // Phase 2: Docker自動起動を試行
    if (this.config.qdrant.docker.enabled) {
      const dockerResult = await this.tryDockerAutoStart();
      if (dockerResult.success) {
        logger.info('Docker自動起動による接続に成功しました');
        return dockerResult;
      }
    } else {
      logger.debug('Docker自動起動は無効化されています');
    }

    // Phase 3: フォールバック
    logger.warn('Qdrant接続に失敗しました。文字列検索モードで動作します');
    return {
      success: false,
      mode: 'fallback',
      error: new DialogoiError('Qdrant接続に失敗しました', 'QDRANT_CONNECTION_FAILED', {
        explicitError: explicitResult.error?.message,
      }),
    };
  }

  /**
   * Phase 1: 明示的な接続先を試行
   */
  private async tryExplicitConnection(): Promise<QdrantInitializationResult> {
    try {
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

      logger.info('明示的な接続先への接続テストに成功しました');
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
   * Phase 2: Docker自動起動を試行
   */
  private async tryDockerAutoStart(): Promise<QdrantInitializationResult> {
    try {
      logger.debug('Docker自動起動を試行中');

      // ポート使用状況をチェック
      const portInUse = await this.checkPortInUse(6333);
      if (portInUse) {
        logger.debug('ポート6333は既に使用中です');
        return {
          success: false,
          mode: 'docker',
          error: new Error('ポート6333は既に使用中です'),
        };
      }

      // Docker権限チェック
      const hasDockerPermission = await this.checkDockerPermission();
      if (!hasDockerPermission) {
        logger.debug('Docker権限がありません');
        return {
          success: false,
          mode: 'docker',
          error: new Error('Docker権限がありません'),
        };
      }

      // Dockerコンテナを起動
      const containerId = await this.startQdrantContainer();

      // ヘルスチェック待機
      const healthCheck = await this.waitForQdrantHealth(containerId);
      if (!healthCheck) {
        await this.cleanupContainer(containerId);
        return {
          success: false,
          mode: 'docker',
          error: new Error('Qdrantヘルスチェックに失敗しました'),
        };
      }

      // 接続テスト
      const repository = new QdrantVectorRepository({
        url: this.config.qdrant.url,
        apiKey: this.config.qdrant.apiKey,
        timeout: this.config.qdrant.timeout,
        defaultCollection: this.config.qdrant.collection,
      });

      await repository.connect();
      await repository.disconnect();

      this.activeContainerId = containerId;
      logger.info('Docker自動起動による接続に成功しました', { containerId });

      return {
        success: true,
        repository,
        mode: 'docker',
        containerId,
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
   * ポート使用状況をチェック
   */
  private async checkPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('lsof', ['-i', `:${port}`]);

      process.on('close', (code: number) => {
        resolve(code === 0); // 0なら使用中
      });

      process.on('error', () => {
        resolve(false); // エラーなら使用されていないと判断
      });
    });
  }

  /**
   * Docker権限をチェック
   */
  private async checkDockerPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('docker', ['version']);

      process.on('close', (code: number) => {
        resolve(code === 0);
      });

      process.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Qdrant Dockerコンテナを起動
   */
  private async startQdrantContainer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const containerName = `dialogoi-qdrant-${timestamp}`;

      logger.debug('Qdrant Dockerコンテナを起動中', { containerName });

      const process = spawn('docker', [
        'run',
        '-d',
        '--name',
        containerName,
        '-p',
        '6333:6333',
        this.config.qdrant.docker.image,
      ]);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          const containerId = stdout.trim();
          logger.debug('Qdrant Dockerコンテナを起動しました', { containerId });
          resolve(containerId);
        } else {
          logger.error(
            'Qdrant Dockerコンテナの起動に失敗しました',
            new Error(`Docker起動に失敗しました: ${stderr}`),
          );
          reject(new Error(`Docker起動に失敗しました: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        logger.error('Qdrant Dockerコンテナの起動でエラーが発生しました', error);
        reject(error);
      });
    });
  }

  /**
   * Qdrantヘルスチェック待機
   */
  private async waitForQdrantHealth(containerId: string): Promise<boolean> {
    const maxWaitTime = this.config.qdrant.docker.timeout;
    const startTime = Date.now();

    logger.debug('Qdrantヘルスチェック待機中', { containerId, maxWaitTime });

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // シンプルなHTTPヘルスチェック
        const response = await fetch(`${this.config.qdrant.url}/health`);
        if (response.ok) {
          logger.debug('Qdrantヘルスチェックに成功しました');
          return true;
        }
      } catch (error) {
        // 接続エラーは想定内なので、デバッグログのみ
        logger.debug('Qdrantヘルスチェック試行中...', { error: (error as Error).message });
      }

      // 1秒待機
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.debug('Qdrantヘルスチェックがタイムアウトしました');
    return false;
  }

  /**
   * Dockerコンテナをクリーンアップ
   */
  private async cleanupContainer(containerId: string): Promise<void> {
    return new Promise((resolve) => {
      logger.debug('Dockerコンテナをクリーンアップ中', { containerId });

      const process = spawn('docker', ['rm', '-f', containerId]);

      process.on('close', (code) => {
        if (code === 0) {
          logger.debug('Dockerコンテナをクリーンアップしました', { containerId });
        } else {
          logger.warn('Dockerコンテナのクリーンアップに失敗しました', {
            containerId,
            exitCode: code,
          });
        }
        resolve();
      });

      process.on('error', (error) => {
        logger.warn('Dockerコンテナのクリーンアップでエラーが発生しました', {
          containerId,
          error: error.message,
        });
        resolve();
      });
    });
  }

  /**
   * アクティブなコンテナをクリーンアップ
   */
  async cleanup(): Promise<void> {
    if (this.activeContainerId && this.config.qdrant.docker.autoCleanup) {
      logger.info('アクティブなQdrantコンテナをクリーンアップ中', {
        containerId: this.activeContainerId,
      });
      await this.cleanupContainer(this.activeContainerId);
      this.activeContainerId = undefined;
    }
  }

  /**
   * アクティブなコンテナIDを取得
   */
  getActiveContainerId(): string | undefined {
    return this.activeContainerId;
  }
}
