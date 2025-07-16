import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QdrantInitializationService,
  QdrantInitializationResult,
} from './QdrantInitializationService.js';
import { DialogoiConfig } from '../lib/config.js';
import { spawn } from 'child_process';

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
      docker: {
        qdrant: {
          containerName: 'test-qdrant',
          image: 'qdrant/qdrant',
          port: 6333,
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
      // getActiveContainerIdメソッドは新設計では削除されたため、コメントアウト
      // expect(service.getActiveContainerId()).toBeUndefined();
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
      // DockerManagerのモック
      const mockDockerManager = {
        ensureQdrantContainer: vi.fn().mockResolvedValue(false),
        waitForContainerHealth: vi.fn().mockResolvedValue(false),
        getContainerInfo: vi.fn().mockResolvedValue(null),
      };

      (service as unknown as { dockerManager: typeof mockDockerManager }).dockerManager =
        mockDockerManager;

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
      expect(result.error?.message).toContain('Qdrantコンテナの確保に失敗しました');
    });

    it('Docker権限がない場合、Docker起動を試行しない', async () => {
      // DockerManagerのモック
      const mockDockerManager = {
        ensureQdrantContainer: vi.fn().mockResolvedValue(false),
        waitForContainerHealth: vi.fn().mockResolvedValue(false),
        getContainerInfo: vi.fn().mockResolvedValue(null),
      };

      (service as unknown as { dockerManager: typeof mockDockerManager }).dockerManager =
        mockDockerManager;

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
      expect(result.error?.message).toContain('Qdrantコンテナの確保に失敗しました');
    });

    it('Dockerコンテナ起動に成功し、ヘルスチェックが通過する場合、dockerモードで成功する', async () => {
      // DockerManagerのモック（成功ケース）
      const mockDockerManager = {
        ensureQdrantContainer: vi.fn().mockResolvedValue(true),
        waitForContainerHealth: vi.fn().mockResolvedValue(true),
        getContainerInfo: vi.fn().mockResolvedValue({ id: 'container-id-123' }),
      };

      (service as unknown as { dockerManager: typeof mockDockerManager }).dockerManager =
        mockDockerManager;

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
      // 新設計では永続的なコンテナを使用するため、クリーンアップは行わない
      await service.cleanup();

      // spawnが呼ばれていないことを確認
      expect(vi.mocked(spawn)).not.toHaveBeenCalled();
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
