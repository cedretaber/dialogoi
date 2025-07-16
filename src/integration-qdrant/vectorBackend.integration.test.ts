/**
 * VectorBackend Qdrant統合テスト
 *
 * このテストは実際のQdrantインスタンスを使用してVectorBackendの動作を検証します。
 * GitHub ActionsのCI環境でのみ実行されることを想定しています。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { QdrantVectorRepository } from '../repositories/QdrantVectorRepository.js';
import { TransformersEmbeddingService } from '../services/TransformersEmbeddingService.js';
import { VectorBackend } from '../backends/VectorBackend.js';
import { Chunk } from '../backends/SearchBackend.js';
import type { SearchResult } from '../backends/SearchBackend.js';

// CI環境でのみ実行
const isCI = process.env.CI_QDRANT_TEST === 'true';
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';

describe.skipIf(!isCI)('VectorBackend Qdrant Integration Tests', () => {
  let vectorRepository: QdrantVectorRepository;
  let embeddingService: TransformersEmbeddingService;
  let vectorBackend: VectorBackend;
  const testCollectionName = 'test-dialogoi-chunks';
  const testNovelId = 'test-novel';

  beforeAll(async () => {
    // リポジトリとサービスの初期化
    vectorRepository = new QdrantVectorRepository({
      url: qdrantUrl,
      timeout: 10000,
      defaultCollection: testCollectionName,
    });

    embeddingService = new TransformersEmbeddingService({
      model: 'intfloat/multilingual-e5-small',
      batchSize: 32,
    });

    vectorBackend = new VectorBackend(vectorRepository, embeddingService, {
      collectionName: testCollectionName,
      scoreThreshold: 0.5,
      vectorDimensions: 384,
      snippetLength: 200,
    });

    // 初期化処理
    await vectorBackend.initialize();
  });

  afterAll(async () => {
    // テストコレクションの削除
    try {
      await vectorRepository.connect();
      await vectorRepository.deleteCollection(testCollectionName);
    } catch (error) {
      // エラーは無視（コレクションが存在しない場合など）
    }
    await vectorRepository.disconnect();
  });

  beforeEach(async () => {
    // 各テストの前にコレクションをクリア
    await vectorRepository.connect();
    try {
      await vectorRepository.deleteCollection(testCollectionName);
    } catch (error) {
      // エラーは無視
    }
    await vectorRepository.ensureCollection(testCollectionName, 384);
  });

  describe('基本機能', () => {
    it('チャンクの追加と検索が正しく動作する', async () => {
      // テスト用チャンクデータ
      const testChunks: Chunk[] = [
        new Chunk(
          '主人公の設定',
          '主人公の田中太郎は25歳のサラリーマンです。趣味は読書と映画鑑賞で、内向的な性格をしています。',
          'test/characters.md',
          1,
          5,
          0,
          testNovelId,
          'settings',
          ['主人公', 'キャラクター'],
        ),
        new Chunk(
          '世界設定',
          '物語の舞台は現代の東京です。特に新宿の高層ビル群が重要な舞台となります。',
          'test/world.md',
          10,
          15,
          1,
          testNovelId,
          'settings',
          ['世界観', '舞台'],
        ),
        new Chunk(
          'プロットの概要',
          'ある日、主人公は不思議な本を見つけます。その本を読むと、現実世界に変化が起こり始めます。',
          'test/plot.md',
          20,
          25,
          2,
          testNovelId,
          'content',
          ['プロット', '展開'],
        ),
      ];

      // チャンクの追加
      await vectorBackend.add(testChunks);

      // 少し待機（インデックス更新のため）
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 検索テスト
      const results = await vectorBackend.search('主人公について教えて', 3, testNovelId);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].payload.file).toBe('test/characters.md');
      expect(results[0].snippet).toContain('田中太郎');
    });

    it('ファイルタイプでフィルタリングできる', async () => {
      const testChunks: Chunk[] = [
        new Chunk(
          '設定ファイル',
          '魔法のシステムについての詳細な設定',
          'test/magic.md',
          1,
          5,
          0,
          testNovelId,
          'settings',
          ['魔法', '設定'],
        ),
        new Chunk(
          '本文ファイル',
          '主人公が魔法を使うシーン',
          'test/chapter1.md',
          10,
          15,
          1,
          testNovelId,
          'content',
          ['魔法', '本文'],
        ),
      ];

      await vectorBackend.add(testChunks);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 設定ファイルのみ検索
      const settingsResults = await vectorBackend.search('魔法', 5, testNovelId, 'settings');
      expect(settingsResults.length).toBeGreaterThan(0);
      expect(settingsResults[0].payload.file).toBe('test/magic.md');

      // 本文ファイルのみ検索
      const contentResults = await vectorBackend.search('魔法', 5, testNovelId, 'content');
      expect(contentResults.length).toBeGreaterThan(0);
      expect(contentResults[0].payload.file).toBe('test/chapter1.md');
    });
  });

  describe('更新・削除機能', () => {
    it('ファイル単位での削除が正しく動作する', async () => {
      const testChunks: Chunk[] = [
        new Chunk(
          'チャンク1',
          'ファイルAの内容1',
          'test/fileA.md',
          1,
          5,
          0,
          testNovelId,
          'content',
          [],
        ),
        new Chunk(
          'チャンク2',
          'ファイルAの内容2',
          'test/fileA.md',
          6,
          10,
          1,
          testNovelId,
          'content',
          [],
        ),
        new Chunk(
          'チャンク3',
          'ファイルBの内容',
          'test/fileB.md',
          1,
          5,
          0,
          testNovelId,
          'content',
          [],
        ),
      ];

      await vectorBackend.add(testChunks);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // ファイルAを削除
      await vectorBackend.removeByFile('test/fileA.md');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 検索して確認
      const results = await vectorBackend.search('内容', 10, testNovelId);
      const fileAResults = results.filter((r: SearchResult) => r.payload.file === 'test/fileA.md');
      const fileBResults = results.filter((r: SearchResult) => r.payload.file === 'test/fileB.md');

      expect(fileAResults.length).toBe(0);
      expect(fileBResults.length).toBeGreaterThan(0);
    });

    it('小説プロジェクト全体の削除が正しく動作する', async () => {
      const testChunks: Chunk[] = [
        new Chunk(
          'プロジェクト1のチャンク',
          '内容1',
          'test/file1.md',
          1,
          5,
          0,
          'novel-1',
          'content',
          [],
        ),
        new Chunk(
          'プロジェクト2のチャンク',
          '内容2',
          'test/file2.md',
          1,
          5,
          0,
          'novel-2',
          'content',
          [],
        ),
      ];

      await vectorBackend.add(testChunks);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // novel-1を削除
      await vectorBackend.removeByNovel('novel-1');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 各プロジェクトで検索
      const novel1Results = await vectorBackend.search('内容', 10, 'novel-1');
      const novel2Results = await vectorBackend.search('内容', 10, 'novel-2');

      expect(novel1Results.length).toBe(0);
      expect(novel2Results.length).toBeGreaterThan(0);
    });
  });

  describe('日本語処理', () => {
    it('日本語コンテンツの検索が正しく動作する', async () => {
      const testChunks: Chunk[] = [
        new Chunk(
          '魔法システム',
          '魔法使いは特殊な呪文を唱えることで、様々な現象を引き起こすことができます。',
          'test/magic_system.md',
          1,
          3,
          0,
          testNovelId,
          'settings',
          ['魔法', 'システム'],
        ),
        new Chunk(
          '戦闘シーン',
          '主人公は剣を抜き、迫り来る敵に向かって突進した。',
          'test/battle.md',
          50,
          52,
          0,
          testNovelId,
          'content',
          ['戦闘', 'アクション'],
        ),
      ];

      await vectorBackend.add(testChunks);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 日本語クエリでの検索
      const magicResults = await vectorBackend.search('魔法の使い方', 5, testNovelId);
      expect(magicResults.length).toBeGreaterThan(0);
      expect(magicResults[0].payload.file).toBe('test/magic_system.md');

      const battleResults = await vectorBackend.search('戦いのシーン', 5, testNovelId);
      expect(battleResults.length).toBeGreaterThan(0);
      expect(battleResults[0].payload.file).toBe('test/battle.md');
    });
  });

  describe('統計情報', () => {
    it('統計情報が正しく取得できる', async () => {
      const testChunks: Chunk[] = [
        new Chunk(
          'テストチャンク',
          'テスト内容',
          'test/test.md',
          1,
          2,
          0,
          testNovelId,
          'content',
          [],
        ),
      ];

      await vectorBackend.add(testChunks);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const stats = await vectorBackend.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalChunks).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeDefined();
    });
  });
});
