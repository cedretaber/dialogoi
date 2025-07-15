import * as fs from 'fs';
import * as path from 'path';

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
    url: string;
    apiKey?: string;
    collection: string;
    timeout: number;
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
  const targetPath = configPath || defaultPath;

  let fileConfig: Partial<DialogoiConfig> = {};

  try {
    const configContent = fs.readFileSync(targetPath, 'utf-8');
    fileConfig = JSON.parse(configContent) as Partial<DialogoiConfig>;
    console.error(`✅ 設定ファイルをロードしました: ${targetPath}`);
  } catch (error) {
    console.error(`⚠️  設定ファイルが見つかりません: ${targetPath}`);
    console.error('📝 デフォルト設定を使用します');
  }

  // コマンドライン引数の上書きを取得
  const cliOverrides = getCommandLineOverrides();

  // 設定をマージ（優先順位: CLI > ファイル > デフォルト）
  _config = deepMerge(deepMerge(DEFAULT_CONFIG, fileConfig), cliOverrides);

  // CLI引数があれば通知
  if (Object.keys(cliOverrides).length > 0) {
    console.error('📋 コマンドライン引数で設定を上書きしました:', cliOverrides);
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
