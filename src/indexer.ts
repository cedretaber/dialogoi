import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { FlexBackend } from './backends/FlexBackend.js';
import { Preset } from 'flexsearch';
import { Chunk } from './backends/SearchBackend.js';
import { MarkdownChunkingStrategy } from './lib/chunker.js';
import { DialogoiConfig } from './lib/config.js';

/**
 * インデックス管理クラス
 * ファイルシステムの監視、チャンク化、インデックス管理を担当
 */
export class Indexer {
  private backend: FlexBackend;
  private chunkingStrategy: MarkdownChunkingStrategy;
  private config: DialogoiConfig;
  private projectRoot: string;

  constructor(config: DialogoiConfig) {
    this.config = config;
    this.projectRoot = path.resolve(config.projectRoot);

    // FlexBackend の初期化
    this.backend = new FlexBackend({
      profile: config.flex.profile as Preset,
      exportPath: config.flex.exportPath,
    });

    // チャンク化戦略の初期化
    this.chunkingStrategy = new MarkdownChunkingStrategy();
  }

  /**
   * インデックスを初期化
   * 既存のエクスポートファイルがあれば復元、なければ新規作成
   */
  async initialize(): Promise<void> {
    try {
      // 既存インデックスの復元を試行
      await this.importIndex();
      console.log('✅ 既存インデックスを復元しました');
    } catch (error) {
      console.log('📝 新規インデックスを作成します');
      // 新規インデックス作成
      await this.buildFullIndex();
    }
  }

  /**
   * プロジェクト全体のフルインデックスを構築
   */
  async buildFullIndex(): Promise<void> {
    const startTime = Date.now();
    console.log('🔍 プロジェクトファイルを走査中...');

    // ターゲットファイルを検索（*.md, *.txt）
    const files = await this.findTargetFiles();
    console.log(`📄 ${files.length} 個のファイルを発見`);

    let totalChunks = 0;

    // 各ファイルを処理
    for (const filePath of files) {
      try {
        const chunks = await this.processFile(filePath);
        totalChunks += chunks.length;
        console.log(`  ✓ ${path.relative(this.projectRoot, filePath)}: ${chunks.length} チャンク`);
      } catch (error) {
        console.error(`  ✗ ${path.relative(this.projectRoot, filePath)}: ${error}`);
      }
    }

    // インデックスをエクスポート
    await this.exportIndex();

    const duration = Date.now() - startTime;
    console.log(`🎉 インデックス構築完了: ${totalChunks} チャンク, ${duration}ms`);
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
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      });
      files.push(...matches);
    }

    // 重複除去とソート
    return [...new Set(files)].sort();
  }

  /**
   * インデックスをファイルにエクスポート
   */
  async exportIndex(): Promise<void> {
    const exportPath = this.config.flex.exportPath;
    const exportDir = path.dirname(exportPath);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(exportDir, { recursive: true });

    await this.backend.exportIndex(exportPath);
    console.log(`💾 インデックスをエクスポートしました: ${exportPath}`);
  }

  /**
   * ファイルからインデックスをインポート
   */
  async importIndex(): Promise<void> {
    const exportPath = this.config.flex.exportPath;

    // ファイルの存在確認
    try {
      await fs.access(exportPath);
    } catch {
      throw new Error(`インデックスファイルが見つかりません: ${exportPath}`);
    }

    await this.backend.importIndex(exportPath);
    console.log(`📂 インデックスをインポートしました: ${exportPath}`);
  }

  /**
   * ファイル更新時の増分更新
   */
  async updateFile(filePath: string): Promise<void> {
    try {
      // 既存のチャンクを削除
      await this.removeFileChunks(filePath);

      // 新しいチャンクを追加
      await this.processFile(filePath);

      console.log(`🔄 ファイルを更新しました: ${path.relative(this.projectRoot, filePath)}`);
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
      console.log(`🗑️ ファイルを削除しました: ${path.relative(this.projectRoot, filePath)}`);
    } catch (error) {
      console.error(`❌ ファイル削除エラー: ${filePath}`, error);
    }
  }

  /**
   * 特定ファイルのチャンクを削除
   */
  private async removeFileChunks(_filePath: string): Promise<void> {
    // TODO: FlexBackendに全チャンクIDを取得するメソッドを追加するか、
    // ここで該当ファイルのチャンクIDを特定する必要がある
    // 現在は簡単な実装として、ファイル名ベースでIDを推測

    // ファイルに関連するチャンクIDを収集（将来改善が必要）
    const chunkIds: string[] = [];
    // TODO: 実際のチャンクID収集ロジックを実装
    // 現在は仮実装として空配列を返す
    // 将来的には filePath を使用してチャンクIDを特定する必要がある

    if (chunkIds.length > 0) {
      await this.backend.remove(chunkIds);
    }
  }

  /**
   * 検索機能をバックエンドに委譲
   */
  async search(query: string, k: number = this.config.search.defaultK) {
    return this.backend.search(query, k);
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    // 必要に応じてバックエンドのクリーンアップ処理
  }
}
