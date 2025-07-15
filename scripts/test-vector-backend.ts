#!/usr/bin/env tsx
/**
 * VectorBackend 動作確認テストスクリプト
 *
 * 使用方法:
 * 1. Qdrant Docker コンテナを起動: docker run -d -p 6333:6333 qdrant/qdrant
 * 2. このスクリプトを実行: npm run tsx scripts/test-vector-backend.ts
 *
 * テスト内容:
 * - QdrantVectorRepository の接続テスト
 * - TransformersEmbeddingService の初期化テスト
 * - VectorBackend の各メソッドの動作テスト
 */

import { QdrantVectorRepository } from '../src/repositories/QdrantVectorRepository.js';
import { TransformersEmbeddingService } from '../src/services/TransformersEmbeddingService.js';
import { VectorBackend } from '../src/backends/VectorBackend.js';
import { Chunk } from '../src/backends/SearchBackend.js';
import { getLogger } from '../src/logging/index.js';

const logger = getLogger();

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testVectorBackend(): Promise<void> {
  logger.info('VectorBackend 動作確認テストを開始します');

  try {
    // 1. QdrantVectorRepository の初期化
    logger.info('1. QdrantVectorRepository を初期化中...');
    const vectorRepository = new QdrantVectorRepository({
      url: 'http://localhost:6333',
      timeout: 10000,
    });

    // 2. TransformersEmbeddingService の初期化
    logger.info('2. TransformersEmbeddingService を初期化中...');
    const embeddingService = new TransformersEmbeddingService({
      modelName: 'intfloat/multilingual-e5-small',
      batchSize: 32,
    });

    // 3. VectorBackend の初期化
    logger.info('3. VectorBackend を初期化中...');
    const vectorBackend = new VectorBackend(vectorRepository, embeddingService, {
      collectionName: 'test-collection',
      scoreThreshold: 0.5,
      vectorDimensions: 384,
      snippetLength: 200,
    });

    // 4. 初期化処理
    logger.info('4. VectorBackend の初期化処理を実行中...');
    await vectorBackend.initialize();
    logger.info('✅ VectorBackend の初期化が完了しました');

    // 5. テスト用チャンクデータの作成
    logger.info('5. テスト用チャンクデータを作成中...');
    const testChunks: Chunk[] = [
      new Chunk(
        '主人公の設定',
        '主人公の田中太郎は25歳のサラリーマンです。趣味は読書と映画鑑賞で、内向的な性格をしています。',
        'test/characters.md',
        1,
        5,
        0,
        'test-novel',
        ['主人公', 'キャラクター'],
      ),
      new Chunk(
        '世界設定',
        '物語の舞台は現代の東京です。特に新宿の高層ビル群が重要な舞台となります。',
        'test/world.md',
        10,
        15,
        1,
        'test-novel',
        ['世界観', '舞台'],
      ),
      new Chunk(
        'プロットの概要',
        'ある日、主人公は不思議な本を見つけます。その本を読むと、現実世界に変化が起こり始めます。',
        'test/plot.md',
        20,
        25,
        2,
        'test-novel',
        ['プロット', '展開'],
      ),
    ];

    // 6. チャンクの追加テスト
    logger.info('6. チャンクの追加テストを実行中...');
    await vectorBackend.add(testChunks);
    logger.info('✅ チャンクの追加が完了しました');

    // 少し待機してインデックスが完了するのを待つ
    await sleep(2000);

    // 7. 検索テスト
    logger.info('7. 検索テストを実行中...');
    const searchQueries = [
      '主人公について教えて',
      '東京の舞台設定',
      '不思議な本の話',
      '25歳のサラリーマン',
    ];

    for (const query of searchQueries) {
      logger.info(`検索クエリ: "${query}"`);
      const results = await vectorBackend.search(query, 3, 'test-novel');
      logger.info(`検索結果数: ${results.length}`);

      results.forEach((result, index) => {
        logger.info(`  結果 ${index + 1}:`);
        logger.info(`    ID: ${result.id}`);
        logger.info(`    スコア: ${result.score.toFixed(3)}`);
        logger.info(`    ファイル: ${result.payload.file}`);
        logger.info(`    スニペット: ${result.snippet.substring(0, 100)}...`);
      });
    }

    // 8. 統計情報の取得テスト
    logger.info('8. 統計情報の取得テストを実行中...');
    const stats = await vectorBackend.getStats();
    logger.info('統計情報:', stats);

    // 9. ファイル更新シナリオのテスト（実際の運用で使用されるパターン）
    logger.info('9. ファイル更新シナリオのテストを実行中...');

    // 9.1. 特定ファイルのチャンクを削除
    logger.info('  9.1. ファイル削除テスト: test/characters.md');
    await vectorBackend.removeByFile('test/characters.md');

    // 9.2. 削除後の検索確認
    logger.info('  9.2. 削除後の検索確認');
    const searchAfterDelete = await vectorBackend.search('主人公について教えて', 5, 'test-novel');
    logger.info(`  削除後の検索結果数: ${searchAfterDelete.length}`);
    searchAfterDelete.forEach((result, index) => {
      logger.info(`    結果 ${index + 1}: ${result.id} (${result.payload.file})`);
    });

    // 9.3. 更新されたチャンクを再挿入
    logger.info('  9.3. 更新されたチャンクの再挿入');
    const updatedChunk: Chunk = new Chunk(
      '主人公の設定（更新版）',
      '主人公の田中太郎は26歳のエンジニアです。趣味はプログラミングと読書で、内向的な性格をしています。最近は機械学習にも興味を持っています。',
      'test/characters.md',
      1,
      7,
      0,
      'test-novel',
      ['主人公', 'キャラクター', '更新'],
    );

    await vectorBackend.add([updatedChunk]);

    // 9.4. 再挿入後の検索確認
    logger.info('  9.4. 再挿入後の検索確認');
    await sleep(1000); // インデックス更新を待つ
    const searchAfterReinsert = await vectorBackend.search('主人公について教えて', 5, 'test-novel');
    logger.info(`  再挿入後の検索結果数: ${searchAfterReinsert.length}`);
    searchAfterReinsert.forEach((result, index) => {
      logger.info(`    結果 ${index + 1}: ${result.id} (${result.payload.file})`);
      logger.info(`    スニペット: ${result.snippet.substring(0, 80)}...`);
    });

    // 9.5. 機械学習関連の検索で新しいコンテンツが見つかるか確認
    logger.info('  9.5. 新しいコンテンツの検索確認');
    const newContentSearch = await vectorBackend.search('機械学習', 3, 'test-novel');
    logger.info(`  機械学習検索結果数: ${newContentSearch.length}`);
    newContentSearch.forEach((result, index) => {
      logger.info(`    結果 ${index + 1}: ${result.id} (スコア: ${result.score.toFixed(3)})`);
    });

    // 10. 小説プロジェクト全体の削除テスト
    logger.info('10. 小説プロジェクト全体の削除テストを実行中...');
    await vectorBackend.removeByNovel('test-novel');

    // 10.1. 削除後の検索確認
    logger.info('  10.1. 小説削除後の検索確認');
    const searchAfterNovelDelete = await vectorBackend.search(
      '主人公について教えて',
      5,
      'test-novel',
    );
    logger.info(`  小説削除後の検索結果数: ${searchAfterNovelDelete.length}`);

    if (searchAfterNovelDelete.length === 0) {
      logger.info('  ✅ 小説プロジェクトの削除が正常に動作しました');
    } else {
      logger.error('  ❌ 小説プロジェクトの削除に問題があります');
    }

    // 11. 統計情報の確認
    logger.info('11. 最終的な統計情報の確認');
    const finalStats = await vectorBackend.getStats();
    logger.info('最終統計情報:', finalStats);

    logger.info('🎉 VectorBackend の動作確認テストが正常に完了しました！');
  } catch (error) {
    logger.error('❌ テスト中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// メイン実行
async function main(): Promise<void> {
  try {
    await testVectorBackend();
  } catch (error) {
    logger.error('❌ テスト実行中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// 終了処理
process.on('SIGINT', () => {
  logger.info('テストを中断しています...');
  process.exit(0);
});

main();
