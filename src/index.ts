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
import { LoggerFactory } from './logging/index.js';

dotenv.config();

// ログレベルを環境変数から設定
LoggerFactory.setGlobalLogger(LoggerFactory.createLogger(LoggerFactory.getLogLevelFromEnv()));

// Dialogoi設定を読み込み（コマンドライン引数の上書きも適用される）
const dialogoiConfig = loadConfig();

// プロジェクトルートディレクトリを決定
// 設定のprojectRootを使用（既にコマンドライン引数で上書きされている可能性がある）
const baseDir = path.resolve(dialogoiConfig.projectRoot);

console.error(`✅ Dialogoi設定を読み込みました`);
console.error(`📁 プロジェクトルート: ${baseDir}`);
console.error(
  `📊 チャンク設定: maxTokens=${dialogoiConfig.chunk.maxTokens}, overlap=${dialogoiConfig.chunk.overlap}`,
);
console.error(
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

const searchNovelSettingsInput = z.object({
  novelId: z.string().describe('小説のID'),
  keyword: z.string().describe('検索キーワード（正規表現も可能）'),
  useRegex: z.boolean().optional().describe('正規表現として検索するかどうか（デフォルト: false）'),
});

const searchNovelContentInput = z.object({
  novelId: z.string().describe('小説のID'),
  keyword: z.string().describe('検索キーワード（正規表現も可能）'),
  useRegex: z.boolean().optional().describe('正規表現として検索するかどうか（デフォルト: false）'),
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

// 小説の設定ファイルを検索するツール
server.registerTool(
  'search_novel_settings',
  {
    description: '小説の設定ファイルからキーワードを検索します（正規表現検索も可能）',
    inputSchema: searchNovelSettingsInput.shape,
  },
  async (params: { novelId: string; keyword: string; useRegex?: boolean }) => {
    try {
      const searchResults = await novelService.searchNovelSettings(
        params.novelId,
        params.keyword,
        params.useRegex || false,
      );

      const searchType = MarkdownFormatterService.getSearchType(params.useRegex);

      if (searchResults.length === 0) {
        const emptyMessage = MarkdownFormatterService.generateEmptySearchMessage(
          searchType,
          params.keyword,
          '設定ファイル',
        );
        const result = MarkdownFormatterService.formatEmptySearchResults(
          '設定ファイル検索結果',
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
        '設定ファイル検索結果',
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

// 小説の本文ファイルを検索するツール
server.registerTool(
  'search_novel_content',
  {
    description: '小説の本文ファイルからキーワードを検索します（正規表現検索も可能）',
    inputSchema: searchNovelContentInput.shape,
  },
  async (params: { novelId: string; keyword: string; useRegex?: boolean }) => {
    try {
      const searchResults = await novelService.searchNovelContent(
        params.novelId,
        params.keyword,
        params.useRegex || false,
      );

      const searchType = MarkdownFormatterService.getSearchType(params.useRegex);

      if (searchResults.length === 0) {
        const emptyMessage = MarkdownFormatterService.generateEmptySearchMessage(
          searchType,
          params.keyword,
          '本文ファイル',
        );
        const result = MarkdownFormatterService.formatEmptySearchResults(
          '本文ファイル検索結果',
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
        '本文ファイル検索結果',
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
      'プロジェクト全体から関連テキストチャンクを検索します（RAG検索）。自然言語クエリでタイトル・本文・タグを横断検索し、LLMプロンプトに最適化されたMarkdown形式で結果を返します。',
    inputSchema: searchRagInput.shape,
  },
  async (params: { novelId: string; query: string; k?: number }) => {
    try {
      const k = params.k || dialogoiConfig.search.defaultK;
      const maxK = dialogoiConfig.search.maxK;

      // k値を制限内に収める
      const limitedK = Math.min(k, maxK);

      console.error(
        `🔍 RAG検索実行: novelId="${params.novelId}", query="${params.query}", k=${limitedK}`,
      );

      const searchResults = await novelService.searchRag(params.novelId, params.query, limitedK);

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

      console.error(`✅ RAG検索完了: ${searchResults.length}件の結果`);

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
      console.error('❌ RAG検索エラー:', error);
      
      if (error instanceof SearchBackendUnavailableError) {
        // Qdrantバックエンドが利用できない場合の詳細メッセージ
        return {
          content: [
            {
              type: 'text' as const,
              text: `## RAG検索が利用できません\n\nクエリ: **${params.query}**\n\n` +
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

async function main() {
  // Graceful shutdown処理を最初に登録
  const gracefulShutdownHook = (signal: string) => {
    console.error(`🛑 ${signal}シグナルを受信しました。MCPサーバーを停止します...`);

    // 非同期処理を実行し、完了後にプロセスを終了
    novelService
      .cleanup()
      .then(() => {
        console.error('✅ クリーンアップが完了しました');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ クリーンアップに失敗しました:', error);
        process.exit(1);
      });

    // タイムアウトで強制終了（バックアップ）
    setTimeout(() => {
      console.error('⚠️  クリーンアップがタイムアウトしました。強制終了します');
      process.exit(1);
    }, 10 * 1000);
  };

  process.on('SIGINT', () => gracefulShutdownHook('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdownHook('SIGTERM'));

  console.error('🔧 SIGINTとSIGTERMハンドラーを登録しました');

  // NovelService内でIndexerManagerが初期化済み（各小説プロジェクトのIndexerは最初のリクエスト時に作成）
  console.error('🔍 NovelServiceを初期化しました（小説プロジェクト別のIndexerは遅延作成）');

  // Step 1: 検索バックエンドを初期化
  console.error('🔍 検索バックエンドの初期化を開始します...');
  try {
    await novelService.initialize();
    console.error('✅ 検索バックエンドの初期化が完了しました');
  } catch (error) {
    console.error(
      '⚠️  検索バックエンドの初期化でエラーが発生しましたが、サーバーを継続します:',
      error,
    );
  }

  // Step 2: ファイル監視を開始（検索バックエンド初期化後）
  console.error('🔍 ファイル監視を開始します...');
  try {
    await novelService.startFileWatching();
    console.error('🚀 ファイル監視が開始されました');
  } catch (error) {
    console.error('❌ ファイル監視の開始に失敗しました:', error);
  }

  // Step 3: MCPサーバーを開始
  console.error('🔍 MCPサーバーを開始します...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ Dialogoi MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
