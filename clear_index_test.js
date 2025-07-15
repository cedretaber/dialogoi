#!/usr/bin/env node

import { NovelService } from './dist/services/novelService.js';

async function clearIndexTest() {
  console.log('=== インデックスクリアテスト ===');

  const config = {
    vector: 'none',
    projectRoot: './novels',
    chunk: {
      maxTokens: 400,
      overlap: 0.2,
    },
    flex: {
      profile: 'fast',
    },
    search: {
      defaultK: 10,
      maxK: 50,
    },
  };

  const service = new NovelService('./novels', config);

  try {
    // 1. 現在の状態で「魔導師」を検索
    console.log('=== 1. クリア前の「魔導師」検索 ===');
    let results = await service.searchRag('sample_novel', '魔導師', 5);
    console.log(`検索結果: ${results.length}件`);
    results.forEach((result, index) => {
      console.log(`  ${index + 1}. File: ${result.payload.file}`);
      console.log(`     Lines: ${result.payload.start}-${result.payload.end}`);
      console.log(`     Snippet: "${result.snippet.substring(0, 100)}"`);
    });
    console.log('');

    // 2. インデックスをクリア（IndexerManagerにアクセス）
    console.log('=== 2. インデックスをクリア ===');
    if (service.indexerManager) {
      await service.indexerManager.clearNovelIndex('sample_novel');
      console.log('インデックスをクリアしました');
    } else {
      console.log('IndexerManagerが利用できません');
    }

    // 3. クリア後に「魔導師」を検索
    console.log('=== 3. クリア後の「魔導師」検索 ===');
    results = await service.searchRag('sample_novel', '魔導師', 5);
    console.log(`検索結果: ${results.length}件`);
    results.forEach((result, index) => {
      console.log(`  ${index + 1}. File: ${result.payload.file}`);
      console.log(`     Lines: ${result.payload.start}-${result.payload.end}`);
      console.log(`     Snippet: "${result.snippet.substring(0, 100)}"`);
    });
    console.log('');

    // 4. 正常なキーワードで検索してインデックスが機能しているか確認
    console.log('=== 4. 正常なキーワード「太郎」で検索 ===');
    results = await service.searchRag('sample_novel', '太郎', 3);
    console.log(`検索結果: ${results.length}件`);
    results.forEach((result, index) => {
      console.log(`  ${index + 1}. File: ${result.payload.file}`);
      console.log(`     Lines: ${result.payload.start}-${result.payload.end}`);
    });
  } catch (error) {
    console.error('クリアテストエラー:', error);
  }
}

clearIndexTest().catch(console.error);
