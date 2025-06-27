import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { z } from 'zod';
import { NovelService } from './services/novelService.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// コマンドライン引数からベースディレクトリを取得
const args = process.argv.slice(2);
const baseDirIndex = args.indexOf('--base-dir');
let baseDir: string | undefined;

if (baseDirIndex !== -1 && baseDirIndex + 1 < args.length) {
  baseDir = args[baseDirIndex + 1];
} else {
  // 引数が指定されていない場合は、スクリプトのディレクトリを基準にする
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  baseDir = path.join(__dirname, '..');
}

console.error(`Using base directory: ${baseDir}`);

const novelService = new NovelService(baseDir);

const server = new McpServer({
  name: 'Dialogoi',
  version: '1.0.0',
});

const listNovelSettingsInput = z.object({
  novelId: z.string().describe('小説のID'),
});

const searchNovelSettingsInput = z.object({
  novelId: z.string().describe('小説のID'),
  keyword: z.string().describe('検索キーワード'),
});

const searchNovelContentInput = z.object({
  novelId: z.string().describe('小説のID'),
  keyword: z.string().describe('検索キーワード'),
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
      const result = settingsList
        .map((item) => `ファイル名: ${item.filename}\nプレビュー:\n${item.preview}\n---`)
        .join('\n\n');

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
    description: '小説の設定ファイルからキーワードを検索します',
    inputSchema: searchNovelSettingsInput.shape,
  },
  async (params: { novelId: string; keyword: string }) => {
    try {
      const searchResults = await novelService.searchNovelSettings(params.novelId, params.keyword);

      if (searchResults.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `キーワード「${params.keyword}」に一致する設定ファイルが見つかりませんでした。`,
            },
          ],
        };
      }

      const result = searchResults
        .map(
          (item) =>
            `ファイル名: ${item.filename}\n該当箇所:\n${item.matchingLines.join('\n\n')}\n---`,
        )
        .join('\n\n');

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
    description: '小説の本文ファイルからキーワードを検索します',
    inputSchema: searchNovelContentInput.shape,
  },
  async (params: { novelId: string; keyword: string }) => {
    try {
      const searchResults = await novelService.searchNovelContent(params.novelId, params.keyword);

      if (searchResults.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `キーワード「${params.keyword}」に一致する本文ファイルが見つかりませんでした。`,
            },
          ],
        };
      }

      const result = searchResults
        .map(
          (item) =>
            `ファイル名: ${item.filename}\n該当箇所:\n${item.matchingLines.join('\n\n')}\n---`,
        )
        .join('\n\n');

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
      const result = projects
        .map(
          (project) =>
            `ID: ${project.id}\nタイトル: ${project.title}${project.description ? `\n概要: ${project.description}` : ''}\n---`,
        )
        .join('\n\n');

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
      const result = contentList
        .map((item) => `ファイル名: ${item.filename}\nプレビュー:\n${item.preview}\n---`)
        .join('\n\n');

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
        return {
          content: [{ type: 'text' as const, text: '指示ファイルが見つかりませんでした。' }],
        };
      }
      const result = list
        .map((item) => `ファイル名: ${item.filename}\nプレビュー:\n${item.preview}\n---`)
        .join('\n\n');
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Dialogoi MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
