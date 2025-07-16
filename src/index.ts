import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { z } from 'zod';
import { NovelService } from './services/novelService.js';
import { FileSystemNovelRepository } from './repositories/FileSystemNovelRepository.js';
import { IndexerSearchService } from './services/IndexerSearchService.js';
import { IndexerFileOperationsService } from './services/IndexerFileOperationsService.js';
import { IndexerManager } from './lib/indexerManager.js';
import path from 'path';
import { loadConfig } from './lib/config.js';
import { MarkdownFormatterService } from './services/MarkdownFormatterService.js';
import { SearchBackendUnavailableError } from './errors/DialogoiError.js';
import { LoggerFactory, getLogger } from './logging/index.js';
// import { spawn } from 'child_process'; // 新設計では不要

dotenv.config();

// ログレベルを環境変数から設定
LoggerFactory.setGlobalLogger(LoggerFactory.createLogger(LoggerFactory.getLogLevelFromEnv()));
const logger = getLogger();

// グローバルなクリーンアップ実行フラグ
let cleanupExecuted = false;

// Dialogoi設定を読み込み（コマンドライン引数の上書きも適用される）
const dialogoiConfig = loadConfig();

// プロジェクトルートディレクトリを決定
// 設定のprojectRootを使用（既にコマンドライン引数で上書きされている可能性がある）
const baseDir = path.resolve(dialogoiConfig.projectRoot);

logger.info(`✅ Dialogoi設定を読み込みました`);
logger.info(`📁 プロジェクトルート: ${baseDir}`);
logger.info(
  `📊 チャンク設定: maxTokens=${dialogoiConfig.chunk.maxTokens}, overlap=${dialogoiConfig.chunk.overlap}`,
);
logger.info(
  `🔍 検索設定: defaultK=${dialogoiConfig.search.defaultK}, maxK=${dialogoiConfig.search.maxK}`,
);

// リファクタリング後のアーキテクチャで各サービスを初期化
const novelRepository = new FileSystemNovelRepository(baseDir);
const indexerManager = new IndexerManager(dialogoiConfig);
const searchService = new IndexerSearchService(novelRepository, indexerManager);
const fileOperationsService = new IndexerFileOperationsService(novelRepository, indexerManager);
const novelService = new NovelService(novelRepository, searchService, fileOperationsService);

const server = new McpServer({
  name: 'Dialogoi',
  version: '1.0.0',
});

const listNovelSettingsInput = z.object({
  novelId: z.string().describe('小説のID'),
});

const searchNovelTextInput = z.object({
  novelId: z.string().describe('小説のID'),
  keyword: z.string().describe('検索キーワード（正規表現も可能）'),
  useRegex: z.boolean().optional().describe('正規表現として検索するかどうか（デフォルト: false）'),
  fileType: z
    .enum(['content', 'settings', 'both'])
    .optional()
    .describe(
      '検索対象のファイルタイプ (content: 本文, settings: 設定, both: 両方) (デフォルト: both)',
    ),
});

const getNovelSettingsInput = z.object({
  novelId: z.string().describe('小説のID'),
  filename: z.string().optional().describe('設定ファイル名（省略時は基本設定ファイル）'),
});

// 小説の設定ファイル一覧を取得するツール
server.registerTool(
  'list_novel_settings',
  {
    description: '小説の設定ファイル一覧と各ファイルの先頭3行を取得します',
    inputSchema: listNovelSettingsInput.shape,
  },
  async (params: { novelId: string }) => {
    try {
      const settingsList = await novelService.listNovelSettings(params.novelId);
      const result = MarkdownFormatterService.formatFileList(
        '設定ファイル一覧',
        params.novelId,
        settingsList,
      );

      return {
        content: [{ type: 'text' as const, text: result }],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
      };
    }
  },
);

// 小説の設定を取得するツール
server.registerTool(
  'get_novel_settings',
  {
    description:
      '小説の設定情報を取得します（.md または .txt ファイル）。filenameを指定すると特定のファイルを取得します',
    inputSchema: getNovelSettingsInput.shape,
  },
  async (params: { novelId: string; filename?: string }) => {
    try {
      const settings = await novelService.getNovelSettings(params.novelId, params.filename);
      return {
        content: [{ type: 'text' as const, text: settings }],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
      };
    }
  },
);

// 統合テキスト検索ツール
server.registerTool(
  'search_novel_text',
  {
    description:
      'プロジェクト内のテキストファイルからキーワードを検索します（正規表現検索も可能）。ファイルタイプ別フィルタリング（本文/設定/両方）に対応しています。',
    inputSchema: searchNovelTextInput.shape,
  },
  async (params: {
    novelId: string;
    keyword: string;
    useRegex?: boolean;
    fileType?: 'content' | 'settings' | 'both';
  }) => {
    try {
      const fileType = params.fileType || 'both';
      const searchResults = await novelService.searchNovelText(
        params.novelId,
        params.keyword,
        params.useRegex || false,
        fileType,
      );

      const searchType = MarkdownFormatterService.getSearchType(params.useRegex);
      const fileTypeLabel = getFileTypeLabel(fileType);

      if (searchResults.length === 0) {
        const emptyMessage = MarkdownFormatterService.generateEmptySearchMessage(
          searchType,
          params.keyword,
          fileTypeLabel,
        );
        const result = MarkdownFormatterService.formatEmptySearchResults(
          `${fileTypeLabel}検索結果`,
          params.novelId,
          params.keyword,
          searchType,
          emptyMessage,
        );
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      }

      const result = MarkdownFormatterService.formatSearchResults(
        `${fileTypeLabel}検索結果`,
        params.novelId,
        params.keyword,
        searchType,
        searchResults,
      );

      return {
        content: [{ type: 'text' as const, text: result }],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
      };
    }
  },
);

/**
 * ファイルタイプのラベルを取得
 */
function getFileTypeLabel(fileType: 'content' | 'settings' | 'both'): string {
  switch (fileType) {
    case 'content':
      return '本文ファイル';
    case 'settings':
      return '設定ファイル';
    case 'both':
      return 'テキストファイル';
    default:
      return 'テキストファイル';
  }
}

const listNovelProjectsInput = z.object({});

const listNovelContentInput = z.object({
  novelId: z.string().describe('小説のID'),
});

const getNovelContentInput = z.object({
  novelId: z.string().describe('小説のID'),
  filename: z.string().optional().describe('本文ファイル名（省略時は全ファイル結合）'),
});

const addNovelSettingInput = z.object({
  novelId: z.string().describe('小説のID'),
  directory: z.string().describe('設定ディレクトリ名'),
  filename: z.string().describe('ファイル名（.md または .txt）'),
  content: z.string().describe('ファイル内容'),
  overwrite: z.boolean().optional().describe('既存ファイルを上書きするか（デフォルト: false）'),
});

const addNovelContentInput = z.object({
  novelId: z.string().describe('小説のID'),
  directory: z.string().describe('本文ディレクトリ名'),
  filename: z.string().describe('ファイル名（.md または .txt）'),
  content: z.string().describe('ファイル内容'),
  overwrite: z.boolean().optional().describe('既存ファイルを上書きするか（デフォルト: false）'),
});

// ===== 指示ファイル =====

const listNovelInstructionsInput = z.object({
  novelId: z.string().describe('小説のID'),
});

const getNovelInstructionsInput = z.object({
  novelId: z.string().describe('小説のID'),
  filename: z.string().optional().describe('指示ファイル名（省略時は全ファイル結合）'),
});

const searchRagInput = z.object({
  novelId: z.string().describe('小説のID'),
  query: z.string().describe('検索クエリ（自然言語）'),
  k: z.number().int().min(1).max(50).optional().describe('返す結果の最大数（デフォルト: 10）'),
  fileType: z
    .enum(['content', 'settings', 'both'])
    .optional()
    .describe(
      '検索対象のファイルタイプ (content: 本文, settings: 設定, both: 両方) (デフォルト: both)',
    ),
});

// 小説プロジェクト一覧を取得するツール
server.registerTool(
  'list_novel_projects',
  {
    description: '利用可能な小説プロジェクト一覧を取得します',
    inputSchema: listNovelProjectsInput.shape,
  },
  async () => {
    try {
      const projects = await novelService.listNovelProjects();
      const result = MarkdownFormatterService.formatProjectList(projects);

      return {
        content: [{ type: 'text' as const, text: result }],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
      };
    }
  },
);

// 小説の本文ファイル一覧を取得するツール
server.registerTool(
  'list_novel_content',
  {
    description: '小説の本文ファイル一覧と各ファイルの先頭3行を取得します',
    inputSchema: listNovelContentInput.shape,
  },
  async (params: { novelId: string }) => {
    try {
      const contentList = await novelService.listNovelContent(params.novelId);
      const result = MarkdownFormatterService.formatFileList(
        '本文ファイル一覧',
        params.novelId,
        contentList,
      );

      return {
        content: [{ type: 'text' as const, text: result }],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
      };
    }
  },
);

// 小説の本文を取得するツール
server.registerTool(
  'get_novel_content',
  {
    description:
      '小説の本文を取得します（.txt または .md ファイル）。filenameを指定すると特定のファイルを取得します',
    inputSchema: getNovelContentInput.shape,
  },
  async (params: { novelId: string; filename?: string }) => {
    try {
      const content = await novelService.getNovelContent(params.novelId, params.filename);
      return {
        content: [{ type: 'text' as const, text: content }],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
      };
    }
  },
);

// 設定ファイルを追加するツール
server.registerTool(
  'add_novel_setting',
  {
    description: '小説の設定ファイルを新規作成します（セキュリティチェック付き）',
    inputSchema: addNovelSettingInput.shape,
  },
  async (params: {
    novelId: string;
    directory: string;
    filename: string;
    content: string;
    overwrite?: boolean;
  }) => {
    try {
      await novelService.addNovelSetting(
        params.novelId,
        params.directory,
        params.filename,
        params.content,
        params.overwrite || false,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `設定ファイル '${params.filename}' を '${params.directory}' ディレクトリに正常に作成しました。`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
      };
    }
  },
);

// 本文ファイルを追加するツール
server.registerTool(
  'add_novel_content',
  {
    description: '小説の本文ファイルを新規作成します（セキュリティチェック付き）',
    inputSchema: addNovelContentInput.shape,
  },
  async (params: {
    novelId: string;
    directory: string;
    filename: string;
    content: string;
    overwrite?: boolean;
  }) => {
    try {
      await novelService.addNovelContent(
        params.novelId,
        params.directory,
        params.filename,
        params.content,
        params.overwrite || false,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `本文ファイル '${params.filename}' を '${params.directory}' ディレクトリに正常に作成しました。`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }],
      };
    }
  },
);

// 指示ファイル一覧を取得
server.registerTool(
  'list_novel_instructions',
  {
    description:
      '[必須:最初に実行] 小説プロジェクトのガイドライン(DIALOGOI.md など)を確認するためのツールです。指示ファイル一覧と各ファイルの先頭3行を取得します。',
    inputSchema: listNovelInstructionsInput.shape,
  },
  async (params: { novelId: string }) => {
    try {
      const list = await novelService.listNovelInstructions(params.novelId);
      if (list.length === 0) {
        const result = MarkdownFormatterService.formatEmptyFileList(
          '指示ファイル一覧',
          params.novelId,
          '指示ファイルが見つかりませんでした。',
        );
        return {
          content: [{ type: 'text' as const, text: result }],
        };
      }
      const result = MarkdownFormatterService.formatFileList(
        '指示ファイル一覧',
        params.novelId,
        list,
      );
      return { content: [{ type: 'text' as const, text: result }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return { content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }] };
    }
  },
);

// 指示ファイル取得
server.registerTool(
  'get_novel_instructions',
  {
    description:
      '[必須:最初に実行] プロジェクトのガイドライン(DIALOGOI.md)を全文取得します。filename を省略すると全指示ファイルを結合して返します。',
    inputSchema: getNovelInstructionsInput.shape,
  },
  async (params: { novelId: string; filename?: string }) => {
    try {
      const content = await novelService.getNovelInstructions(params.novelId, params.filename);
      return { content: [{ type: 'text' as const, text: content }] };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return { content: [{ type: 'text' as const, text: `Error: ${errorMsg}` }] };
    }
  },
);

// RAG検索ツール
server.registerTool(
  'search_rag',
  {
    description:
      'プロジェクト全体から関連テキストチャンクを検索します（RAG検索）。multilingual-e5-smallモデルによる意味的類似度検索で、自然言語クエリから関連コンテンツを発見します。ファイルタイプ別フィルタリング（本文/設定/両方）、Qdrant側フィルタリングによる高速検索、LLMプロンプトに最適化されたMarkdown形式での結果出力を提供します。',
    inputSchema: searchRagInput.shape,
  },
  async (params: {
    novelId: string;
    query: string;
    k?: number;
    fileType?: 'content' | 'settings' | 'both';
  }) => {
    try {
      const k = params.k || dialogoiConfig.search.defaultK;
      const maxK = dialogoiConfig.search.maxK;

      // k値を制限内に収める
      const limitedK = Math.min(k, maxK);
      const fileType = params.fileType || 'both';

      logger.info(
        `🔍 RAG検索実行: novelId="${params.novelId}", query="${params.query}", k=${limitedK}, fileType=${fileType}`,
      );

      const searchResults = await novelService.searchRag(
        params.novelId,
        params.query,
        limitedK,
        fileType,
      );

      if (searchResults.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `クエリ「${params.query}」に一致するコンテンツが見つかりませんでした。\n\n別のキーワードをお試しください。`,
            },
          ],
        };
      }

      logger.info(`✅ RAG検索完了: ${searchResults.length}件の結果`);

      // Markdown引用形式でLLMプロンプトに最適化
      const formattedResults = searchResults
        .map((result, index) => {
          const header = `**結果 ${index + 1}** (スコア: ${result.score.toFixed(3)}, ファイル: ${result.payload.file})`;
          const tags =
            result.payload.tags && result.payload.tags.length > 0
              ? `\n*タグ: ${result.payload.tags.join(', ')}*`
              : '';
          const snippet = result.snippet;

          return `${header}${tags}\n> ${snippet.replace(/\n/g, '\n> ')}`;
        })
        .join('\n\n');

      const summary = `## RAG検索結果\n\n**クエリ:** ${params.query}\n**結果数:** ${searchResults.length}/${limitedK}\n\n${formattedResults}`;

      return {
        content: [{ type: 'text' as const, text: summary }],
      };
    } catch (error) {
      logger.error('❌ RAG検索エラー', error instanceof Error ? error : undefined);

      if (error instanceof SearchBackendUnavailableError) {
        // Qdrantバックエンドが利用できない場合の詳細メッセージ
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `## RAG検索が利用できません\n\nクエリ: **${params.query}**\n\n` +
                `⚠️ **セマンティック検索機能が現在利用できません**\n\n` +
                `**理由:** ${error.context?.error || 'Qdrantベクターデータベースに接続できません'}\n\n` +
                `**対処方法:**\n` +
                `• Qdrantサーバーが起動していることを確認してください\n` +
                `• 設定ファイルの接続情報が正しいことを確認してください\n` +
                `• 代わりに \`search_settings_files\` または \`search_content_files\` ツールをお試しください（キーワード検索）`,
            },
          ],
        };
      }

      // その他のエラー
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{ type: 'text' as const, text: `RAG検索エラー: ${errorMsg}` }],
      };
    }
  },
);

// 非同期初期化処理を実行する関数
const executeInitialization = async (): Promise<void> => {
  // NovelService内でIndexerManagerが初期化済み（各小説プロジェクトのIndexerは最初のリクエスト時に作成）
  logger.info('🔍 NovelServiceを初期化しました（小説プロジェクト別のIndexerは遅延作成）');

  // Step 1: 検索バックエンドを初期化
  logger.info('🔍 検索バックエンドの初期化を開始します...');
  const initStartTime = Date.now();
  try {
    await novelService.initialize();
    const initDuration = Date.now() - initStartTime;
    logger.info(`✅ 検索バックエンドの初期化が完了しました（${initDuration}ms）`);
  } catch (error) {
    const initDuration = Date.now() - initStartTime;
    logger.warn(
      `⚠️  検索バックエンドの初期化でエラーが発生しましたが、サーバーを継続します（${initDuration}ms）`,
    );
  }

  // Step 2: ファイル監視を開始（検索バックエンド初期化後）
  logger.info('🔍 ファイル監視を開始します...');
  const watchStartTime = Date.now();
  try {
    await novelService.startFileWatching();
    const watchDuration = Date.now() - watchStartTime;
    logger.info(`🚀 ファイル監視が開始されました（${watchDuration}ms）`);
  } catch (error) {
    const watchDuration = Date.now() - watchStartTime;
    logger.error(
      `❌ ファイル監視の開始に失敗しました（${watchDuration}ms）`,
      error instanceof Error ? error : undefined,
    );
  }
};

// MCPサーバーの初期化ハンドラーを設定
server.server.oninitialized = () => {
  logger.info('🔧 MCPサーバーが初期化されました。アプリケーションの初期化を開始します...');

  // 非同期初期化処理を実行（ブロッキングしない）
  executeInitialization()
    .then(() => {
      logger.info('✅ アプリケーションの初期化が完了しました');
    })
    .catch((error) => {
      logger.error(
        '❌ アプリケーションの初期化で予期しないエラーが発生しました',
        error instanceof Error ? error : undefined,
      );
    });
};

/**
 * 統一されたクリーンアップ処理
 * @param source クリーンアップの実行元
 * @returns クリーンアップが実行されたかどうか
 */
const executeCleanup = async (source: string): Promise<boolean> => {
  if (cleanupExecuted) {
    logger.info(`🔄 ${source}: クリーンアップは既に実行済みです`);
    return false;
  }

  logger.info(`🧹 ${source}からクリーンアップを実行します...`);
  cleanupExecuted = true;

  try {
    await novelService.cleanup();
    logger.info(`✅ ${source}: クリーンアップが完了しました`);
    return true;
  } catch (error) {
    logger.error(
      `❌ ${source}: クリーンアップに失敗しました`,
      error instanceof Error ? error : undefined,
    );
    return false;
  }
};

// MCPサーバーのクローズハンドラーを設定
server.server.onclose = () => {
  logger.info('🛑 MCPサーバーの接続が閉じられました');

  // 統一されたクリーンアップ処理を実行
  let cleanupCompleted = false;
  let cleanupError: Error | null = null;

  executeCleanup('MCP onclose')
    .then((executed) => {
      cleanupCompleted = true;
      if (executed) {
        logger.info('✅ MCP onclose: クリーンアップが完了しました');
      }
    })
    .catch((error) => {
      cleanupCompleted = true;
      cleanupError = error;
      logger.error(
        '❌ MCP onclose: クリーンアップでエラーが発生しました',
        error instanceof Error ? error : undefined,
      );
    });

  // 同期的にクリーンアップ完了を待機（最大3秒）
  const maxWaitTime = 3000;
  const checkInterval = 50;
  const startTime = Date.now();

  while (!cleanupCompleted && Date.now() - startTime < maxWaitTime) {
    const waitStart = Date.now();
    while (Date.now() - waitStart < checkInterval) {
      // 同期的な待機
    }
  }

  if (!cleanupCompleted) {
    logger.warn('⚠️  MCP onclose: クリーンアップがタイムアウトしました（3秒）');
  } else if (cleanupError) {
    logger.error('❌ MCP onclose: クリーンアップでエラーが発生しました', cleanupError);
  }
};

logger.info('🔧 MCPサーバーハンドラーを設定しました');

const handleProcessShutdown = async (signal: string) => {
  logger.info(`🛑 プロセスシグナル ${signal} を受信しました`);

  try {
    const executed = await executeCleanup(`プロセスシグナル ${signal}`);
    if (executed) {
      logger.info(`✅ プロセスシグナル ${signal}: クリーンアップが完了しました`);
    }
  } catch (error) {
    logger.error(
      `❌ プロセスシグナル ${signal}: クリーンアップでエラーが発生しました`,
      error instanceof Error ? error : undefined,
    );
  }

  logger.info(`🏁 プロセスシグナル ${signal} 処理完了、プロセスを終了します`);
  process.exit(0);
};

// SIGINT (Ctrl+C) とSIGTERM のハンドラーを設定
process.on('SIGINT', () => handleProcessShutdown('SIGINT'));
process.on('SIGTERM', () => handleProcessShutdown('SIGTERM'));

// プロセス終了時の最終的なクリーンアップ（新設計：Docker停止なし）
process.on('beforeExit', () => {
  logger.info('🛑 beforeExit イベントが発生しました');

  if (cleanupExecuted) {
    logger.info('🔄 beforeExit: クリーンアップは既に実行済みです');
    return;
  }

  logger.info('🛑 beforeExit: 新設計により、Dockerコンテナは永続的に利用されます');
  cleanupExecuted = true;
});

// プロセス終了時の緊急クリーンアップ
process.on('exit', (code) => {
  logger.info(`🏁 プロセス終了 (code: ${code})`);

  if (!cleanupExecuted) {
    logger.warn('⚠️  通常のクリーンアップが実行されませんでした');
  }
});

// エラーハンドリング
process.on('uncaughtException', (error) => {
  logger.error('❌ uncaughtException', error instanceof Error ? error : undefined);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ unhandledRejection', reason instanceof Error ? reason : undefined, { promise });
});

logger.info('🔧 シャットダウンハンドラーを設定しました');

async function main() {
  // MCPサーバーを開始
  logger.info('🔍 MCPサーバーを開始します...');
  const transport = new StdioServerTransport();

  // stdin の 'end' イベントを監視してシャットダウンを検出
  process.stdin.on('end', () => {
    logger.info('🛑 stdin 終了が検出されました');

    executeCleanup('stdin 終了')
      .then((executed) => {
        if (executed) {
          logger.info('✅ stdin 終了: クリーンアップが完了しました');
        }
        process.exit(0);
      })
      .catch((error) => {
        logger.error(
          '❌ stdin 終了: クリーンアップでエラーが発生しました',
          error instanceof Error ? error : undefined,
        );
        process.exit(1);
      });
  });

  await server.connect(transport);
  logger.info('✅ Dialogoi MCP Server started');
}

main().catch((error) => {
  logger.error('Failed to start server', error instanceof Error ? error : undefined);
  process.exit(1);
});
