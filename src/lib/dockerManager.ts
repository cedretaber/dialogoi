import { spawn } from 'child_process';
import { getLogger } from '../logging/index.js';
import { DialogoiConfig } from './config.js';

/**
 * Docker コンテナの状態
 */
export type ContainerStatus = 'running' | 'stopped' | 'not_found';

/**
 * コンテナ情報
 */
export interface ContainerInfo {
  id: string;
  name: string;
  status: ContainerStatus;
  ports: string[];
}

/**
 * Docker コンテナ管理クラス
 */
export class DockerManager {
  private readonly logger = getLogger();
  private readonly config: DialogoiConfig;

  constructor(config: DialogoiConfig) {
    this.config = config;
  }

  /**
   * コンテナの存在と状態を確認
   * @param containerName コンテナ名
   * @returns コンテナ情報
   */
  async getContainerInfo(containerName: string): Promise<ContainerInfo | null> {
    return new Promise((resolve) => {
      const process = spawn('docker', [
        'ps',
        '-a',
        '--format',
        '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}',
        '--filter',
        `name=${containerName}`,
      ]);

      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          this.logger.warn('Docker ps コマンドが失敗しました', { code });
          resolve(null);
          return;
        }

        const lines = output
          .trim()
          .split('\n')
          .filter((line) => line.trim());

        if (lines.length === 0) {
          resolve(null);
          return;
        }

        const [id, name, statusText, ports] = lines[0].split('\t');
        const status: ContainerStatus = statusText.includes('Up') ? 'running' : 'stopped';

        resolve({
          id,
          name,
          status,
          ports: ports ? ports.split(',').map((p) => p.trim()) : [],
        });
      });

      process.on('error', (error) => {
        this.logger.error('Docker ps コマンドでエラーが発生しました', error);
        resolve(null);
      });
    });
  }

  /**
   * コンテナを起動
   * @param containerName コンテナ名
   * @returns 起動に成功したかどうか
   */
  async startContainer(containerName: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.logger.info(`コンテナを起動中: ${containerName}`);

      const process = spawn('docker', ['start', containerName]);

      process.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`コンテナの起動に成功しました: ${containerName}`);
          resolve(true);
        } else {
          this.logger.error(`コンテナの起動に失敗しました: ${containerName} (exitCode: ${code})`);
          resolve(false);
        }
      });

      process.on('error', (error) => {
        this.logger.error('コンテナ起動コマンドでエラーが発生しました', error);
        resolve(false);
      });
    });
  }

  /**
   * 新しいコンテナを作成して起動
   * @param containerName コンテナ名
   * @param image イメージ名
   * @param port ポート番号
   * @returns 作成に成功したかどうか
   */
  async createAndStartContainer(
    containerName: string,
    image: string,
    port: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.logger.info(`新しいコンテナを作成中: ${containerName}`);

      const process = spawn('docker', [
        'run',
        '-d',
        '--name',
        containerName,
        '-p',
        `${port}:${port}`,
        image,
      ]);

      process.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`コンテナの作成と起動に成功しました: ${containerName}`);
          resolve(true);
        } else {
          this.logger.error(`コンテナの作成に失敗しました: ${containerName} (exitCode: ${code})`);
          resolve(false);
        }
      });

      process.on('error', (error) => {
        this.logger.error('コンテナ作成コマンドでエラーが発生しました', error);
        resolve(false);
      });
    });
  }

  /**
   * Qdrant コンテナを確保（既存の場合は再利用、なければ作成）
   * @returns コンテナが利用可能かどうか
   */
  async ensureQdrantContainer(): Promise<boolean> {
    const containerName = this.config.docker.qdrant.containerName;
    const image = this.config.docker.qdrant.image;
    const port = this.config.docker.qdrant.port;

    this.logger.info(`Qdrant コンテナを確保中: ${containerName}`);

    // 既存のコンテナを確認
    const existingContainer = await this.getContainerInfo(containerName);

    if (existingContainer) {
      this.logger.info(`既存のコンテナを発見: ${containerName}`, {
        status: existingContainer.status,
        id: existingContainer.id,
      });

      if (existingContainer.status === 'running') {
        this.logger.info(`コンテナは既に実行中です: ${containerName}`);
        return true;
      }

      if (existingContainer.status === 'stopped') {
        this.logger.info(`停止中のコンテナを起動します: ${containerName}`);
        return await this.startContainer(containerName);
      }
    }

    // 新しいコンテナを作成
    this.logger.info(`新しいコンテナを作成します: ${containerName}`);
    return await this.createAndStartContainer(containerName, image, port);
  }

  /**
   * コンテナの健全性チェック
   * @param containerName コンテナ名
   * @param port ポート番号
   * @param timeoutMs タイムアウト時間（ミリ秒）
   * @returns 健全性チェックの結果
   */
  async waitForContainerHealth(
    containerName: string,
    port: number,
    timeoutMs: number = 30000,
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const containerInfo = await this.getContainerInfo(containerName);

      if (containerInfo && containerInfo.status === 'running') {
        // ポートが利用可能かチェック（簡易版）
        try {
          const net = await import('net');
          const client = new net.Socket();

          const connected = await new Promise<boolean>((resolve) => {
            client.setTimeout(1000);
            client.connect(port, 'localhost', () => {
              client.destroy();
              resolve(true);
            });
            client.on('error', () => {
              resolve(false);
            });
            client.on('timeout', () => {
              client.destroy();
              resolve(false);
            });
          });

          if (connected) {
            this.logger.info(`コンテナが正常に動作中: ${containerName}`);
            return true;
          }
        } catch (error) {
          this.logger.debug(`ポート接続テストでエラー: ${error}`);
        }
      }

      // 1秒待機
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.logger.warn(`コンテナの健全性チェックがタイムアウトしました: ${containerName}`);
    return false;
  }
}
