import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MCPサーバーとの統合テスト（E2E テスト）
 * 実際のMCPサーバープロセスを起動し、JSON-RPC通信を行ってテストする
 */
describe('MCP Server Integration Tests', () => {
  let serverProcess: ChildProcess | null = null;
  let messageId = 0;
  let responseBuffer = '';

  const getNextMessageId = () => ++messageId;

  /**
   * MCPサーバーを起動
   */
  const startMCPServer = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 既存プロセスがある場合は事前にクリーンアップ
      if (serverProcess) {
        serverProcess.kill('SIGKILL');
        serverProcess = null;
      }

      // ビルド済みのJSファイルを使用
      const distPath = path.resolve(__dirname, '../../dist/index.js');
      const testConfigPath = path.resolve(__dirname, '../../config/test.dialogoi.config.json');
      serverProcess = spawn('node', [distPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DIALOGOI_CONFIG_PATH: testConfigPath,
        },
      });

      if (!serverProcess.stdout || !serverProcess.stdin || !serverProcess.stderr) {
        reject(new Error('サーバープロセスの標準入出力が利用できません'));
        return;
      }

      serverProcess.stdout.on('data', (data) => {
        responseBuffer += data.toString();
      });

      serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.log('Server stderr:', output); // デバッグ用
        // サーバーの起動完了メッセージを待つ
        if (output.includes('Dialogoi MCP Server started')) {
          resolve();
        }
      });

      serverProcess.on('error', (error) => {
        console.error('Server process error:', error); // デバッグ用
        reject(error);
      });

      // 10秒でタイムアウト（Docker無効化により短縮）
      setTimeout(() => {
        reject(new Error('サーバー起動タイムアウト'));
      }, 10000);
    });
  };

  /**
   * MCPサーバーを停止
   */
  const stopMCPServer = async (): Promise<void> => {
    return new Promise((resolve) => {
      if (serverProcess) {
        const currentProcess = serverProcess;
        serverProcess = null; // プロセス参照をクリア

        currentProcess.on('exit', () => {
          resolve();
        });
        // SIGTERMを送信してサーバーを停止
        currentProcess.kill('SIGTERM');

        // 3秒でタイムアウト（強制終了）
        setTimeout(() => {
          if (currentProcess && !currentProcess.killed) {
            console.error('Force killing server process...');
            currentProcess.kill('SIGKILL');
            resolve();
          }
        }, 3000);
      } else {
        resolve();
      }
    });
  };

  /**
   * JSON-RPCメッセージを送信
   */
  const sendMessage = (message: Record<string, unknown>): void => {
    const jsonMessage = JSON.stringify(message) + '\n';
    serverProcess?.stdin?.write(jsonMessage);
  };

  /**
   * レスポンスを待機して取得
   */
  const waitForResponse = async (timeout: number = 3000): Promise<Record<string, unknown>> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkResponse = () => {
        const lines = responseBuffer.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              // レスポンスが見つかったらバッファから削除
              responseBuffer = responseBuffer.replace(line + '\n', '');
              return resolve(response);
            } catch (e) {
              // JSONパースエラーは無視（部分的なレスポンスの可能性）
            }
          }
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`レスポンスタイムアウト: ${timeout}ms`));
        } else {
          setTimeout(checkResponse, 50);
        }
      };

      checkResponse();
    });
  };

  beforeEach(async () => {
    messageId = 0;
    responseBuffer = '';
    try {
      await startMCPServer();
    } catch (error) {
      // 起動失敗時もクリーンアップを実行
      await stopMCPServer();
      throw error;
    }
  });

  afterEach(async () => {
    await stopMCPServer();
  });

  describe('MCPプロトコル基本動作', () => {
    it('初期化シーケンスが正常に動作する', async () => {
      const initializeMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      sendMessage(initializeMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
      const result = response.result as {
        protocolVersion: string;
        serverInfo: { name: string; version: string };
        capabilities: { tools: unknown };
      };
      expect(result.protocolVersion).toBe('2024-11-05');
      expect(result.serverInfo).toBeDefined();
      expect(result.serverInfo.name).toBe('Dialogoi');
      expect(result.serverInfo.version).toBe('1.0.0');
      expect(result.capabilities).toBeDefined();
      expect(result.capabilities.tools).toBeDefined();
    });

    it('initialized通知が正常に処理される', async () => {
      // 初期化
      const initializeMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      sendMessage(initializeMessage);
      await waitForResponse();

      // initialized通知
      const initializedMessage = {
        jsonrpc: '2.0',
        method: 'initialized',
        params: {},
      };

      sendMessage(initializedMessage);

      // 通知なので応答は期待しない（エラーが発生しないことを確認）
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('ツール一覧が正常に取得できる', async () => {
      // 初期化
      const initializeMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      sendMessage(initializeMessage);
      await waitForResponse();

      // ツール一覧取得
      const listToolsMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/list',
        params: {},
      };

      sendMessage(listToolsMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(2);
      expect(response.result).toBeDefined();
      const result = response.result as { tools: Array<{ name: string }> };
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);

      // 期待されるツールが含まれているか確認
      const toolNames = result.tools.map((tool) => tool.name);
      expect(toolNames).toContain('list_novel_projects');
      expect(toolNames).toContain('list_novel_settings');
      expect(toolNames).toContain('search_novel_text');
      expect(toolNames).toContain('search_rag');
    });
  });

  describe('実際のツール呼び出しテスト', () => {
    beforeEach(async () => {
      // 各テストの前に初期化を実行
      const initializeMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      sendMessage(initializeMessage);
      await waitForResponse();
    });

    it('プロジェクト一覧が正常に取得できる', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'list_novel_projects',
          arguments: {},
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('## 利用可能な小説プロジェクト');
    });

    it('設定ファイル一覧が正常に取得できる', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'list_novel_settings',
          arguments: {
            novelId: 'sample_novel',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('## 設定ファイル一覧');
      expect(result.content[0].text).toContain('sample_novel');
    });

    it('統合テキスト検索（search_novel_text）が正常に動作する', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_novel_text',
          arguments: {
            novelId: 'sample_novel',
            keyword: '主人公',
            useRegex: false,
            fileType: 'both',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('## テキストファイル検索結果');
      expect(result.content[0].text).toContain('主人公');
    });

    it('search_novel_text設定ファイル検索のみが正常に動作する', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_novel_text',
          arguments: {
            novelId: 'sample_novel',
            keyword: 'キャラクター',
            useRegex: false,
            fileType: 'settings',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('## 設定ファイル検索結果');
      expect(result.content[0].text).toContain('キャラクター');
    });

    it('search_novel_text本文ファイル検索のみが正常に動作する', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_novel_text',
          arguments: {
            novelId: 'sample_novel',
            keyword: 'chapter',
            useRegex: false,
            fileType: 'content',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('## 本文ファイル検索結果');
      expect(result.content[0].text).toContain('chapter');
    });

    it('search_novel_text正規表現検索が正常に動作する', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_novel_text',
          arguments: {
            novelId: 'sample_novel',
            keyword: '主人公|キャラクター',
            useRegex: true,
            fileType: 'both',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('## テキストファイル検索結果');
      expect(result.content[0].text).toContain('正規表現');
    });

    it('search_novel_textデフォルト動作（fileType未指定）が正常に動作する', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_novel_text',
          arguments: {
            novelId: 'sample_novel',
            keyword: 'test',
            useRegex: false,
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('## テキストファイル検索結果');
    });

    it('RAG検索が正常に動作する', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_rag',
          arguments: {
            novelId: 'sample_novel',
            query: '主人公',
            k: 3,
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse(10000); // RAG検索は時間がかかる場合がある

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      // Qdrant利用不可時のユーザーフレンドリーなエラーメッセージが返されることを確認
      expect(result.content[0].text).toContain('## RAG検索が利用できません');
      expect(result.content[0].text).toContain('セマンティック検索機能が現在利用できません');
      expect(result.content[0].text).toContain('search_settings_files');
      expect(result.content[0].text).toContain('search_content_files');
    });

    it('存在しないプロジェクトでエラーが適切に返される', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'list_novel_settings',
          arguments: {
            novelId: 'nonexistent_project',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error:');
    });

    it('不正なツール名でエラーが適切に返される', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool',
          arguments: {},
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      expect(response.jsonrpc).toBe('2.0');
      expect(response.error).toBeDefined();
      const error = response.error as { code: unknown; message: string };
      expect(error.code).toBeDefined();
      expect(error.message).toBeDefined();
    });
  });

  describe('Markdown出力形式の検証', () => {
    beforeEach(async () => {
      // 初期化
      const initializeMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      sendMessage(initializeMessage);
      await waitForResponse();
    });

    it('プロジェクト一覧のMarkdown形式が正しい', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'list_novel_projects',
          arguments: {},
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      const result = response.result as { content: Array<{ type: string; text: string }> };
      const text = result.content[0].text;
      expect(text).toMatch(/^## 利用可能な小説プロジェクト/);
      expect(text).toMatch(/\*\*プロジェクト数:\*\* \d+/);
      expect(text).toMatch(/### \d+\. .+/);
      expect(text).toMatch(/\*\*プロジェクトID:\*\* `.+`/);
    });

    it('設定ファイル一覧のMarkdown形式が正しい', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'list_novel_settings',
          arguments: {
            novelId: 'sample_novel',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      const result = response.result as { content: Array<{ type: string; text: string }> };
      const text = result.content[0].text;
      expect(text).toMatch(/^## 設定ファイル一覧/);
      expect(text).toMatch(/\*\*プロジェクト:\*\* sample_novel/);
      expect(text).toMatch(/\*\*ファイル数:\*\* \d+/);
      expect(text).toMatch(/### \d+\. .+/);
      expect(text).toMatch(/```[\s\S]*?```/);
    });

    it('search_novel_text統合検索結果のMarkdown形式が正しい', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_novel_text',
          arguments: {
            novelId: 'sample_novel',
            keyword: '主人公',
            useRegex: false,
            fileType: 'both',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      const result = response.result as { content: Array<{ type: string; text: string }> };
      const text = result.content[0].text;
      expect(text).toMatch(/^## テキストファイル検索結果/);
      expect(text).toMatch(/\*\*プロジェクト:\*\* sample_novel/);
      expect(text).toMatch(/\*\*クエリ:\*\* 主人公/);
      expect(text).toMatch(/\*\*検索タイプ:\*\* キーワード/);
      expect(text).toMatch(/\*\*結果数:\*\* \d+/);
    });

    it('search_novel_text設定ファイル検索結果のMarkdown形式が正しい', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_novel_text',
          arguments: {
            novelId: 'sample_novel',
            keyword: 'キャラクター',
            useRegex: false,
            fileType: 'settings',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      const result = response.result as { content: Array<{ type: string; text: string }> };
      const text = result.content[0].text;
      expect(text).toMatch(/^## 設定ファイル検索結果/);
      expect(text).toMatch(/\*\*プロジェクト:\*\* sample_novel/);
      expect(text).toMatch(/\*\*クエリ:\*\* キャラクター/);
      expect(text).toMatch(/\*\*検索タイプ:\*\* キーワード/);
      expect(text).toMatch(/\*\*結果数:\*\* \d+/);
    });

    it('search_novel_text正規表現検索結果のMarkdown形式が正しい', async () => {
      const callToolMessage = {
        jsonrpc: '2.0',
        id: getNextMessageId(),
        method: 'tools/call',
        params: {
          name: 'search_novel_text',
          arguments: {
            novelId: 'sample_novel',
            keyword: '主人公|キャラクター',
            useRegex: true,
            fileType: 'both',
          },
        },
      };

      sendMessage(callToolMessage);
      const response = await waitForResponse();

      const result = response.result as { content: Array<{ type: string; text: string }> };
      const text = result.content[0].text;
      expect(text).toMatch(/^## テキストファイル検索結果/);
      expect(text).toMatch(/\*\*プロジェクト:\*\* sample_novel/);
      expect(text).toMatch(/\*\*クエリ:\*\* 主人公\|キャラクター/);
      expect(text).toMatch(/\*\*検索タイプ:\*\* 正規表現/);
      expect(text).toMatch(/\*\*結果数:\*\* \d+/);
    });
  });
});
