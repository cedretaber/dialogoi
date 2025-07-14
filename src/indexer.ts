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

  constructor(config: DialogoiConfig) {
    this.config = config;
    this.projectRoot = path.resolve(config.projectRoot);

    // KeywordFlexBackend の初期化
    this.backend = new KeywordFlexBackend({
      profile: config.flex.profile as Preset,
      baseDirectory: this.projectRoot,
    });

    // チャンク化戦略の初期化
    this.chunkingStrategy = new MarkdownChunkingStrategy();
  }

  /**
   * 特定の小説プロジェクトのインデックスを構築
   */
  async indexNovel(novelId: string): Promise<void> {
    const startTime = Date.now();
    console.error(`🔍 小説プロジェクト "${novelId}" のファイルを走査中...`);

    // ターゲットファイルを検索（*.md, *.txt）
    const files = await this.findTargetFiles(novelId);
    console.error(`📄 ${files.length} 個のファイルを発見`);

    let totalChunks = 0;

    // 各ファイルを処理
    for (const filePath of files) {
      try {
        const chunks = await this.processFile(filePath, novelId);
        totalChunks += chunks.length;
        console.error(
          `  ✓ ${path.relative(this.projectRoot, filePath)}: ${chunks.length} チャンク`,
        );
      } catch (error) {
        console.error(`  ✗ ${path.relative(this.projectRoot, filePath)}: ${error}`);
      }
    }

    const duration = Date.now() - startTime;
    console.error(
      `🎉 小説プロジェクト "${novelId}" のインデックス構築完了: ${totalChunks} チャンク, ${duration}ms`,
    );
  }

  /**
   * 単一ファイルを処理してチャンクを生成・追加
   */
  async processFile(filePath: string, novelId: string): Promise<Chunk[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(this.projectRoot, filePath);

    // チャンキング実行
    const chunkData = this.chunkingStrategy.chunk(
      content,
      relativePath,
      this.config.chunk.maxTokens,
      this.config.chunk.overlap,
      novelId,
    );

    // ChunkDataはそのままChunkとして使用可能
    const chunks: Chunk[] = chunkData;

    // バックエンドに追加
    await this.backend.add(chunks);

    return chunks;
  }

  /**
   * 特定の小説プロジェクトのターゲットファイル（*.md, *.txt）を検索
   */
  private async findTargetFiles(novelId: string): Promise<string[]> {
    const novelPath = path.join(this.projectRoot, novelId);
    const patterns = [path.join(novelPath, '**/*.md'), path.join(novelPath, '**/*.txt')];

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

  /**
   * ファイル更新時の増分更新
   */
  async updateFile(filePath: string, novelId: string): Promise<void> {
    try {
      await this.removeFileChunks(filePath);

      // 新しいチャンクを追加
      await this.processFile(filePath, novelId);

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
   * 特定の小説プロジェクトのデータをインデックスから削除
   */
  async removeNovelFromIndex(novelId: string): Promise<void> {
    await this.backend.removeByNovel(novelId);
    console.error(`🗑️ 小説プロジェクト "${novelId}" のインデックスを削除しました`);
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    // 必要に応じてバックエンドのクリーンアップ処理
    await this.backend.dispose();
  }
}
