// Node.js 18+ の内蔵 fetch を使用

// Node.jsのWeb Streams APIをグローバルに設定
globalThis.TransformStream = (await import('node:stream/web')).TransformStream;

import { getLogger } from './logging/index.js';

const logger = getLogger();

async function main() {
  const baseUrl = 'http://localhost:3000';

  try {
    // 小説の設定を取得
    console.log('Getting novel settings...');
    const settingsResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: 'get_novel_settings',
        arguments: {
          novelId: 'sample_novel',
        },
      }),
    });

    console.log('Response status:', settingsResponse.status);
    console.log('Response headers:', settingsResponse.headers);

    const settingsResult = await settingsResponse.json();
    console.log('Settings result:', settingsResult);

    // 小説の本文を取得
    console.log('\nGetting novel content...');
    const contentResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: 'get_novel_content',
        arguments: {
          novelId: 'sample_novel',
          chapter: 1,
        },
      }),
    });

    console.log('Response status:', contentResponse.status);
    console.log('Response headers:', contentResponse.headers);

    const contentResult = await contentResponse.json();
    console.log('Content result:', contentResult);
  } catch (error) {
    logger.error('Error:', error instanceof Error ? error : undefined);
  }
}

main().catch((error) => {
  logger.error('Main function error:', error instanceof Error ? error : undefined);
});

export {};
