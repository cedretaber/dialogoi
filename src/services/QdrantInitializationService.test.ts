import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QdrantInitializationService,
  QdrantInitializationResult,
} from './QdrantInitializationService.js';
import { DialogoiConfig } from '../lib/config.js';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// モック用のChildProcessクラス
class MockChildProcess extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
}

// child_process.spawn をモック
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// fetch をモック
global.fetch = vi.fn();

// QdrantVectorRepository をモック
vi.mock('../repositories/QdrantVectorRepository.js', () => ({
  QdrantVectorRepository: vi.fn(),
}));

describe('QdrantInitializationService', () => {
  let service: QdrantInitializationService;
  let mockConfig: DialogoiConfig;
  let MockQdrantVectorRepository: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // QdrantVectorRepository モックを取得
    const { QdrantVectorRepository } = await import('../repositories/QdrantVectorRepository.js');
    MockQdrantVectorRepository = vi.mocked(QdrantVectorRepository);

    mockConfig = {
      projectRoot: './test-novels',
      chunk: {
        maxTokens: 400,
        overlap: 0.2,
      },
      embedding: {
        enabled: true,
        model: 'intfloat/multilingual-e5-small',
        dimensions: 384,
        batchSize: 32,
      },
      qdrant: {
        url: undefined, // デフォルトではURL未設定
        collection: 'test-collection',
        timeout: 5000,
        docker: {
          enabled: true,
          image: 'qdrant/qdrant',
          timeout: 30000,
          autoCleanup: true,
        },
      },
      vector: {
        collectionName: 'test-collection',
        scoreThreshold: 0.7,
        vectorDimensions: 384,
        snippetLength: 120,
      },
      search: {
        defaultK: 10,
        maxK: 50,
      },
    };

    service = new QdrantInitializationService(mockConfig);
  });

  describe('constructor', () => {
    it('設定でQdrantInitializationServiceが初期化される', () => {
      expect(service).toBeDefined();
      expect(service.getActiveContainerId()).toBeUndefined();
    });
  });

  describe('initialize', () => {
    it('明示的な接続が成功した場合、explicitモードで成功する', async () => {
      // 明示的なURL設定を追加
      mockConfig.qdrant.url = 'http://localhost:6333';
      service = new QdrantInitializationService(mockConfig);

      // QdrantVectorRepository のモック
      const mockRepository = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      MockQdrantVectorRepository.mockImplementation(() => mockRepository);

      const result = await service.initialize();

      expect(result.success).toBe(true);
      expect(result.mode).toBe('explicit');
      expect(result.repository).toBeDefined();
    });

    it('明示的な接続が失敗し、Dockerが無効な場合、fallbackモードになる', async () => {
      // 明示的なURL設定を追加
      mockConfig.qdrant.url = 'http://localhost:6333';
      // Docker無効の設定
      mockConfig.qdrant.docker.enabled = false;
      service = new QdrantInitializationService(mockConfig);

      // QdrantVectorRepository のモック（接続失敗）
      const mockRepository = {
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      MockQdrantVectorRepository.mockImplementation(() => mockRepository);

      const result = await service.initialize();

      expect(result.success).toBe(false);
      expect(result.mode).toBe('fallback');
      expect(result.error).toBeDefined();
    });

    it('URL未設定の場合、直接Docker自動起動を試行する', async () => {
      // URL未設定のまま（デフォルト状態）
      expect(mockConfig.qdrant.url).toBeUndefined();

      // tryDockerAutoStartメソッドをスパイしてモック
      const tryDockerAutoStartSpy = vi
        .spyOn(
          service as unknown as { tryDockerAutoStart: () => Promise<QdrantInitializationResult> },
          'tryDockerAutoStart',
        )
        .mockResolvedValue({
          success: false,
          mode: 'fallback',
          error: new Error('Docker not available in test environment'),
        });

      const result = await service.initialize();

      expect(result.success).toBe(false);
      expect(result.mode).toBe('fallback');
      expect(result.error).toBeDefined();
      expect(tryDockerAutoStartSpy).toHaveBeenCalled();
    });
  });

  describe('tryDockerAutoStart', () => {
    it('ポートが使用中の場合、Docker起動を試行しない', async () => {
      // lsof コマンドのモック（ポート使用中）
      const mockProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess);

      setTimeout(() => {
        mockProcess.emit('close', 0); // ポート使用中
      }, 10);

      const result = await (
        service as unknown as {
          tryDockerAutoStart(): Promise<{
            success: boolean;
            mode: string;
            error?: { message: string };
          }>;
        }
      ).tryDockerAutoStart();

      expect(result.success).toBe(false);
      expect(result.mode).toBe('docker');
      expect(result.error?.message).toContain('ポート6333は既に使用中です');
    });

    it('Docker権限がない場合、Docker起動を試行しない', async () => {
      // lsof コマンドのモック（ポート未使用）
      const mockLsofProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValueOnce(mockLsofProcess as ChildProcess);

      setTimeout(() => {
        mockLsofProcess.emit('close', 1); // ポート未使用
      }, 10);

      // docker version コマンドのモック（権限なし）
      const mockDockerProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValueOnce(mockDockerProcess as ChildProcess);

      setTimeout(() => {
        mockDockerProcess.emit('close', 1); // Docker権限なし
      }, 10);

      const result = await (
        service as unknown as {
          tryDockerAutoStart(): Promise<{
            success: boolean;
            mode: string;
            error?: { message: string };
          }>;
        }
      ).tryDockerAutoStart();

      expect(result.success).toBe(false);
      expect(result.mode).toBe('docker');
      expect(result.error?.message).toContain('Docker権限がありません');
    });

    it('Dockerコンテナ起動に成功し、ヘルスチェックが通過する場合、dockerモードで成功する', async () => {
      // lsof コマンドのモック（ポート未使用）
      const mockLsofProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValueOnce(mockLsofProcess as ChildProcess);

      setTimeout(() => {
        mockLsofProcess.emit('close', 1); // ポート未使用
      }, 10);

      // docker version コマンドのモック（権限あり）
      const mockDockerVersionProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValueOnce(mockDockerVersionProcess as ChildProcess);

      setTimeout(() => {
        mockDockerVersionProcess.emit('close', 0); // Docker権限あり
      }, 10);

      // docker run コマンドのモック（コンテナ起動成功）
      const mockDockerRunProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValueOnce(mockDockerRunProcess as ChildProcess);

      setTimeout(() => {
        mockDockerRunProcess.stdout.emit('data', 'container-id-123\n');
        mockDockerRunProcess.emit('close', 0); // コンテナ起動成功
      }, 10);

      // docker ps コマンドのモック（コンテナ状態確認）
      const mockDockerPsProcess = new MockChildProcess();
      vi.mocked(spawn).mockReturnValueOnce(mockDockerPsProcess as ChildProcess);

      setTimeout(() => {
        mockDockerPsProcess.stdout.emit(
          'data',
          'NAMES\tSTATUS\tPORTS\ntest-container\tUp 5 seconds\t0.0.0.0:6333->6333/tcp\n',
        );
        mockDockerPsProcess.emit('close', 0); // コンテナ状態確認成功
      }, 10);

      // fetch のモック（ヘルスチェック成功）
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
      } as Response);

      // QdrantVectorRepository のモック
      const mockRepository = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      MockQdrantVectorRepository.mockImplementation(() => mockRepository);

      const result = await (
        service as unknown as {
          tryDockerAutoStart(): Promise<{
            success: boolean;
            mode: string;
            containerId?: string;
            repository?: unknown;
          }>;
        }
      ).tryDockerAutoStart();

      expect(result.success).toBe(true);
      expect(result.mode).toBe('docker');
      expect(result.containerId).toBe('container-id-123');
      expect(result.repository).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('アクティブなコンテナがある場合、クリーンアップを実行する', async () => {
      // アクティブなコンテナIDを設定
      (service as unknown as { activeContainerId: string }).activeContainerId = 'test-container-id';

      // docker rm コマンドのモック
      const mockDockerRmProcess = new EventEmitter();
      vi.mocked(spawn).mockReturnValue(mockDockerRmProcess as ChildProcess);

      setTimeout(() => {
        mockDockerRmProcess.emit('close', 0); // クリーンアップ成功
      }, 10);

      await service.cleanup();

      expect(vi.mocked(spawn)).toHaveBeenCalledWith('docker', ['rm', '-f', 'test-container-id']);
      expect(service.getActiveContainerId()).toBeUndefined();
    });

    it('アクティブなコンテナがない場合、何もしない', async () => {
      await service.cleanup();

      expect(vi.mocked(spawn)).not.toHaveBeenCalled();
    });

    it('autoCleanupが無効の場合、クリーンアップを実行しない', async () => {
      // autoCleanup無効の設定
      mockConfig.qdrant.docker.autoCleanup = false;
      service = new QdrantInitializationService(mockConfig);

      // アクティブなコンテナIDを設定
      (service as unknown as { activeContainerId: string }).activeContainerId = 'test-container-id';

      await service.cleanup();

      expect(vi.mocked(spawn)).not.toHaveBeenCalled();
    });
  });
});
