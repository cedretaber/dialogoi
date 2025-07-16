#!/usr/bin/env node

import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';

// MCPサーバーを起動
const serverProcess = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  shell: true,
});

// テストメッセージを送信
const testMessages = [
  // 1. 小説プロジェクト一覧を取得
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'list_novel_projects',
      arguments: {},
    },
  },
  // 2. sample_novelの設定一覧を取得
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'list_novel_settings',
      arguments: {
        novelId: 'sample_novel',
      },
    },
  },
  // 3. RAG検索を実行
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search_rag',
      arguments: {
        novelId: 'sample_novel',
        query: 'キャラクター',
        k: 5,
      },
    },
  },
];

// 初期化メッセージを送信
const initMessage = {
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {
      roots: {
        listChanged: true,
      },
    },
    clientInfo: {
      name: 'test-client',
      version: '1.0.0',
    },
  },
};

console.log('🔌 MCPサーバーに接続中...');
serverProcess.stdin.write(JSON.stringify(initMessage) + '\n');

let messageIndex = 0;
let initialized = false;

serverProcess.stdout.on('data', (data) => {
  const lines = data
    .toString()
    .split('\n')
    .filter((line) => line.trim());

  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      console.log(`📨 レスポンス ${response.id}:`, JSON.stringify(response, null, 2));

      if (response.id === 0 && !initialized) {
        console.log('✅ 初期化完了、テスト開始');
        initialized = true;
        // 初期化完了後、テストメッセージを送信
        sendNextMessage();
      } else if (response.id > 0) {
        // 次のメッセージを送信
        sendNextMessage();
      }
    } catch (e) {
      console.log('📝 サーバー出力:', line);
    }
  }
});

function sendNextMessage() {
  if (messageIndex < testMessages.length) {
    const message = testMessages[messageIndex++];
    console.log(`📤 送信中 (${messageIndex}/${testMessages.length}):`, message.params.name);
    serverProcess.stdin.write(JSON.stringify(message) + '\n');
  } else {
    console.log('🎉 全テスト完了');
    console.log('🛑 サーバーを正常終了します...');

    // MCPプロトコルに従って適切にサーバーを終了
    // stdin.end()でサーバーに終了を通知
    serverProcess.stdin.end();

    // サーバーが正常終了するまで少し待機
    setTimeout(() => {
      if (!serverProcess.killed) {
        console.log('⚠️  サーバーが正常終了しなかったため、強制終了します');
        serverProcess.kill();
      }
      process.exit(0);
    }, 2000); // 2秒待機
  }
}

serverProcess.on('close', (code, signal) => {
  console.log(`📋 サーバー終了 (code: ${code}, signal: ${signal})`);
});

serverProcess.on('exit', (code, signal) => {
  console.log(`🚪 サーバープロセス終了 (code: ${code}, signal: ${signal})`);
});

// 10秒後にタイムアウト
setTimeout(() => {
  console.log('⏰ タイムアウト');
  console.log('🛑 サーバーを強制終了します...');
  serverProcess.kill();
  process.exit(1);
}, 10000);
