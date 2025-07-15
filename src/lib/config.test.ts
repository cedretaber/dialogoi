import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import type { DialogoiConfig } from './config.js';

// モジュールをモック
vi.mock('fs');

describe('Config Loader', () => {
  let loadConfig: (configPath?: string) => DialogoiConfig;
  let getConfig: () => DialogoiConfig;
  const originalArgv = process.argv;

  beforeEach(async () => {
    vi.clearAllMocks();
    // process.argvをリセット
    process.argv = [...originalArgv.slice(0, 2)];
    // モジュールをリセットして再インポート
    vi.resetModules();
    const configModule = await import('./config.js');
    loadConfig = configModule.loadConfig;
    getConfig = configModule.getConfig;
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it('should load config from JSON file', () => {
    const mockConfig = JSON.stringify(
      {
        projectRoot: './test-novels',
        chunk: {
          maxTokens: 300,
          overlap: 0.15,
        },
        embedding: {
          enabled: true,
          model: 'intfloat/multilingual-e5-small',
          dimensions: 384,
          batchSize: 32,
        },
        qdrant: {
          url: 'http://localhost:6333',
          collection: 'dialogoi-chunks',
          timeout: 5000,
        },
        vector: {
          collectionName: 'dialogoi-chunks',
          scoreThreshold: 0.7,
          vectorDimensions: 384,
          snippetLength: 120,
        },
        search: {
          defaultK: 5,
          maxK: 30,
        },
      },
      null,
      2,
    );

    vi.mocked(fs.readFileSync).mockReturnValue(mockConfig);

    const config = loadConfig();

    expect(config).toEqual({
      projectRoot: './test-novels',
      chunk: {
        maxTokens: 300,
        overlap: 0.15,
      },
      embedding: {
        enabled: true,
        model: 'intfloat/multilingual-e5-small',
        dimensions: 384,
        batchSize: 32,
      },
      qdrant: {
        url: 'http://localhost:6333',
        collection: 'dialogoi-chunks',
        timeout: 5000,
        docker: {
          enabled: true,
          image: 'qdrant/qdrant',
          timeout: 30000,
          autoCleanup: true,
        },
      },
      vector: {
        collectionName: 'dialogoi-chunks',
        scoreThreshold: 0.7,
        vectorDimensions: 384,
        snippetLength: 120,
      },
      search: {
        defaultK: 5,
        maxK: 30,
      },
    });
  });

  it('should use default config when file not found', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });

    const config = loadConfig();

    expect(config).toEqual({
      projectRoot: './novels',
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
        url: 'http://localhost:6333',
        collection: 'dialogoi-chunks',
        timeout: 5000,
        docker: {
          enabled: true,
          image: 'qdrant/qdrant',
          timeout: 30000,
          autoCleanup: true,
        },
      },
      vector: {
        collectionName: 'dialogoi-chunks',
        scoreThreshold: 0.7,
        vectorDimensions: 384,
        snippetLength: 120,
      },
      search: {
        defaultK: 10,
        maxK: 50,
      },
    });
  });

  it('should merge partial config with defaults', () => {
    const mockConfig = JSON.stringify({
      chunk: {
        maxTokens: 500,
      },
    });

    vi.mocked(fs.readFileSync).mockReturnValue(mockConfig);

    const config = loadConfig();

    expect(config.vector.collectionName).toBe('dialogoi-chunks');
    expect(config.chunk.maxTokens).toBe(500);
    expect(config.chunk.overlap).toBe(0.2); // デフォルト値
    expect(config.embedding.enabled).toBe(true); // デフォルト値
  });

  it('should override config with command line arguments', () => {
    // コマンドライン引数を設定
    process.argv.push('--project-root', './cli-novels');
    process.argv.push('--max-tokens', '600');
    process.argv.push('--default-k', '20');

    const mockConfig = JSON.stringify({
      vector: 'none',
      projectRoot: './file-novels',
      chunk: {
        maxTokens: 400,
      },
    });

    vi.mocked(fs.readFileSync).mockReturnValue(mockConfig);

    const config = loadConfig();

    expect(config.projectRoot).toBe('./cli-novels'); // CLIが優先
    expect(config.chunk.maxTokens).toBe(600); // CLIが優先
    expect(config.search.defaultK).toBe(20); // CLIが優先
    expect(config.chunk.overlap).toBe(0.2); // デフォルト値
  });

  it('should support legacy --base-dir argument', () => {
    // 後方互換性のテスト
    process.argv.push('--base-dir', './legacy-novels');

    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });

    const config = loadConfig();

    expect(config.projectRoot).toBe('./legacy-novels');
  });

  it('should cache loaded config', () => {
    const mockConfig = JSON.stringify({ vector: 'none' });
    vi.mocked(fs.readFileSync).mockReturnValue(mockConfig);

    const config1 = loadConfig();
    const config2 = getConfig();

    expect(config1).toBe(config2);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });
});
