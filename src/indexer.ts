import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { KeywordFlexBackend } from './backends/KeywordFlexBackend.js';
import type { Preset } from 'flexsearch';
import { Chunk } from './backends/SearchBackend.js';
import { MarkdownChunkingStrategy } from './lib/chunker.js';
import { DialogoiConfig } from './lib/config.js';

/**
 * インデックス管理クラス
 * ファイルシステムの監視、チャンク化、インデックス管理を担当
 */
export class Indexer {
  private backend: KeywordFlexBackend;
  private chunkingStrategy: MarkdownChunkingStrategy;
  private config: DialogoiConfig;
  private projectRoot: string;
  private novelId: string;

  constructor(config: DialogoiConfig, novelId: string) {
    this.config = config;
    this.projectRoot = path.resolve(config.projectRoot);
    this.novelId = novelId;

    // KeywordFlexBackend の初期化
    this.backend = new KeywordFlexBackend({
      profile: config.flex.profile as Preset,
      baseDirectory: this.projectRoot,
    });

    // チャンク化戦略の初期化
    this.chunkingStrategy = new MarkdownChunkingStrategy();
  }

  /**
   * インデックスを初期化
   * ファイルをスキャンしてインデックスを構築
   */
  async initialize(): Promise<void> {
    console.error('📝 インデックスを構築します');
    await this.buildFullIndex();
  }

  /**
   * プロジェクト全体のフルインデックスを構築
   */
  async buildFullIndex(): Promise<void> {
    const startTime = Date.now();
    console.error('🔍 プロジェクトファイルを走査中...');

    // ターゲットファイルを検索（*.md, *.txt）
    const files = await this.findTargetFiles();
    console.error(`📄 ${files.length} 個のファイルを発見`);

    let totalChunks = 0;

    // 各ファイルを処理
    for (const filePath of files) {
      try {
        const chunks = await this.processFile(filePath);
        totalChunks += chunks.length;
        console.error(
          `  ✓ ${path.relative(this.projectRoot, filePath)}: ${chunks.length} チャンク`,
        );
      } catch (error) {
        console.error(`  ✗ ${path.relative(this.projectRoot, filePath)}: ${error}`);
      }
    }

    // インデックスはメモリ内に保持（エクスポート不要）

    const duration = Date.now() - startTime;
    console.error(`🎉 インデックス構築完了: ${totalChunks} チャンク, ${duration}ms`);
  }

  /**
   * 単一ファイルを処理してチャンクを生成・追加
   */
  async processFile(filePath: string): Promise<Chunk[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(this.projectRoot, filePath);

    // チャンキング実行
    const chunkData = this.chunkingStrategy.chunk(
      content,
      relativePath,
      this.config.chunk.maxTokens,
      this.config.chunk.overlap,
      this.novelId,
    );

    // ChunkDataはそのままChunkとして使用可能
    const chunks: Chunk[] = chunkData;

    // バックエンドに追加
    await this.backend.add(chunks);

    return chunks;
  }

  /**
   * ターゲットファイル（*.md, *.txt）を検索
   */
  private async findTargetFiles(): Promise<string[]> {
    const patterns = [
      path.join(this.projectRoot, '**/*.md'),
      path.join(this.projectRoot, '**/*.txt'),
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        ignore: ['**/.*/**'],
      });
      files.push(...matches);
    }

    // 重複除去とソート
    return [...new Set(files)].sort();
  }

  // import/exportメソッドは削除（メモリ内インデックスのみ使用）

  /**
   * ファイル更新時の増分更新
   */
  async updateFile(filePath: string): Promise<void> {
    try {
      // 既存のチャンクを削除
      await this.removeFileChunks(filePath);

      // 新しいチャンクを追加
      await this.processFile(filePath);

      console.error(`🔄 ファイルを更新しました: ${path.relative(this.projectRoot, filePath)}`);
    } catch (error) {
      console.error(`❌ ファイル更新エラー: ${filePath}`, error);
    }
  }

  /**
   * ファイル削除時の処理
   */
  async removeFile(filePath: string): Promise<void> {
    try {
      await this.removeFileChunks(filePath);
      console.error(`🗑️ ファイルを削除しました: ${path.relative(this.projectRoot, filePath)}`);
    } catch (error) {
      console.error(`❌ ファイル削除エラー: ${filePath}`, error);
    }
  }

  /**
   * 特定ファイルのチャンクを削除
   */
  private async removeFileChunks(filePath: string): Promise<void> {
    // removeByFileメソッドを使用してファイル単位で削除
    await this.backend.removeByFile(filePath);
  }

  /**
   * 検索機能をバックエンドに委譲
   */
  async search(query: string, k: number = this.config.search.defaultK, novelId: string) {
    return this.backend.search(query, k, novelId);
  }

  /**
   * バックエンドが準備完了かチェック
   */
  isReady(): boolean {
    return this.backend.isReady();
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    // 必要に応じてバックエンドのクリーンアップ処理
    await this.backend.dispose();
  }
}
