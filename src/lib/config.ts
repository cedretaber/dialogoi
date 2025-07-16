import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../logging/index.js';

// 設定の型定義
export interface DialogoiConfig {
  projectRoot: string;
  chunk: {
    maxTokens: number;
    overlap: number;
  };
  embedding: {
    enabled: boolean;
    model: string;
    dimensions: number;
    batchSize: number;
  };
  qdrant: {
    url?: string; // 明示的に設定された場合のみ接続試行
    apiKey?: string;
    collection: string;
    timeout: number;
    docker: {
      enabled: boolean;
      image: string;
      timeout: number;
      autoCleanup: boolean;
    };
  };
  docker: {
    qdrant: {
      containerName: string;
      image: string;
      port: number;
    };
  };
  vector: {
    collectionName: string;
    scoreThreshold: number;
    vectorDimensions: number;
    snippetLength: number;
  };
  search: {
    defaultK: number;
    maxK: number;
  };
}

// デフォルト設定
const DEFAULT_CONFIG: DialogoiConfig = {
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
    url: undefined, // ユーザが明示的に設定した場合のみ接続試行
    collection: 'dialogoi-chunks',
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
      containerName: 'dialogoi-qdrant',
      image: 'qdrant/qdrant',
      port: 6333,
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
};

let _config: DialogoiConfig | null = null;

/**
 * コマンドライン引数から設定の上書きを取得
 */
function getCommandLineOverrides(): Partial<DialogoiConfig> {
  const args = process.argv.slice(2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overrides: Record<string, any> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--project-root':
      case '--base-dir': // 既存の--base-dirもサポート
        if (nextArg && !nextArg.startsWith('--')) {
          overrides.projectRoot = nextArg;
          i++;
        }
        break;
      case '--max-tokens':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.chunk) overrides.chunk = {};
          overrides.chunk.maxTokens = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--overlap':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.chunk) overrides.chunk = {};
          overrides.chunk.overlap = parseFloat(nextArg);
          i++;
        }
        break;
      case '--default-k':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.search) overrides.search = {};
          overrides.search.defaultK = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--max-k':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.search) overrides.search = {};
          overrides.search.maxK = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--qdrant-url':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.qdrant) overrides.qdrant = {};
          overrides.qdrant.url = nextArg;
          i++;
        }
        break;
      case '--qdrant-api-key':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.qdrant) overrides.qdrant = {};
          overrides.qdrant.apiKey = nextArg;
          i++;
        }
        break;
      case '--qdrant-collection':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.qdrant) overrides.qdrant = {};
          overrides.qdrant.collection = nextArg;
          i++;
        }
        break;
      case '--qdrant-timeout':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.qdrant) overrides.qdrant = {};
          overrides.qdrant.timeout = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--docker-enabled':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.qdrant) overrides.qdrant = {};
          if (!overrides.qdrant.docker) overrides.qdrant.docker = {};
          overrides.qdrant.docker.enabled = nextArg === 'true';
          i++;
        }
        break;
      case '--docker-image':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.qdrant) overrides.qdrant = {};
          if (!overrides.qdrant.docker) overrides.qdrant.docker = {};
          overrides.qdrant.docker.image = nextArg;
          i++;
        }
        break;
      case '--docker-timeout':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.qdrant) overrides.qdrant = {};
          if (!overrides.qdrant.docker) overrides.qdrant.docker = {};
          overrides.qdrant.docker.timeout = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--docker-auto-cleanup':
        if (nextArg && !nextArg.startsWith('--')) {
          if (!overrides.qdrant) overrides.qdrant = {};
          if (!overrides.qdrant.docker) overrides.qdrant.docker = {};
          overrides.qdrant.docker.autoCleanup = nextArg === 'true';
          i++;
        }
        break;
    }
  }

  return overrides as Partial<DialogoiConfig>;
}

/**
 * 設定を深くマージする
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result[key] as Record<string, any>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        source[key] as Record<string, any>,
      ) as T[Extract<keyof T, string>];
    } else if (source[key] !== undefined) {
      result[key] = source[key] as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * 設定ファイルをロードする
 * @param configPath 設定ファイルのパス（省略時はデフォルトパス）
 * @returns 設定オブジェクト
 */
export function loadConfig(configPath?: string): DialogoiConfig {
  if (_config && !configPath) {
    return _config;
  }

  const defaultPath = path.join(process.cwd(), 'config', 'dialogoi.config.json');
  // 環境変数での設定ファイル指定をサポート（テスト用）
  const envConfigPath = process.env.DIALOGOI_CONFIG_PATH;
  const targetPath = configPath || envConfigPath || defaultPath;

  let fileConfig: Partial<DialogoiConfig> = {};

  try {
    const configContent = fs.readFileSync(targetPath, 'utf-8');
    fileConfig = JSON.parse(configContent) as Partial<DialogoiConfig>;
    const logger = getLogger();
    logger.info(`✅ 設定ファイルをロードしました: ${targetPath}`);
  } catch (error) {
    const logger = getLogger();
    logger.warn(`⚠️  設定ファイルが見つかりません: ${targetPath}`);
    logger.info('📝 デフォルト設定を使用します');
  }

  // コマンドライン引数の上書きを取得
  const cliOverrides = getCommandLineOverrides();

  // 設定をマージ（優先順位: CLI > ファイル > デフォルト）
  _config = deepMerge(deepMerge(DEFAULT_CONFIG, fileConfig), cliOverrides);

  // CLI引数があれば通知
  if (Object.keys(cliOverrides).length > 0) {
    const logger = getLogger();
    logger.info('📋 コマンドライン引数で設定を上書きしました:', cliOverrides);
  }

  return _config;
}

/**
 * 現在の設定を取得する
 * @returns 設定オブジェクト
 */
export function getConfig(): DialogoiConfig {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}
