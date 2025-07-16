import * as fs from 'fs/promises';
import * as path from 'path';
import { VectorBackend } from './backends/VectorBackend.js';
import { Chunk } from './backends/SearchBackend.js';
import { MarkdownChunkingStrategy } from './lib/chunker.js';
import { DialogoiConfig } from './lib/config.js';
import { findFilesRecursively } from './utils/fileUtils.js';
import { TransformersEmbeddingService } from './services/TransformersEmbeddingService.js';
import { QdrantVectorRepository } from './repositories/QdrantVectorRepository.js';
import { NovelRepository } from './repositories/NovelRepository.js';
import { FileSystemNovelRepository } from './repositories/FileSystemNovelRepository.js';
import { getLogger } from './logging/index.js';

/**
 * ファイルタイプとファイルパスのペア
 */
interface FileWithType {
  filePath: string;
  fileType: 'content' | 'settings';
}

/**
 * インデックス管理クラス
 * ファイルシステムの監視、チャンク化、インデックス管理を担当
 */
export class Indexer {
  private backend: VectorBackend;
  private chunkingStrategy: MarkdownChunkingStrategy;
  private config: DialogoiConfig;
  private projectRoot: string;
  private novelRepository: NovelRepository;
  private logger = getLogger();

  constructor(config: DialogoiConfig) {
    this.config = config;
    this.projectRoot = path.resolve(config.projectRoot);
    this.novelRepository = new FileSystemNovelRepository(this.projectRoot);

    // VectorBackend の初期化
    const embeddingService = new TransformersEmbeddingService(config.embedding);
    const vectorRepository = new QdrantVectorRepository({
      ...config.qdrant,
      defaultCollection: config.qdrant.collection,
    });
    this.backend = new VectorBackend(vectorRepository, embeddingService, config.vector);

    // チャンク化戦略の初期化
    this.chunkingStrategy = new MarkdownChunkingStrategy();
  }

  /**
   * 特定の小説プロジェクトのインデックスを構築
   */
  async indexNovel(novelId: string): Promise<void> {
    const startTime = Date.now();
    this.logger.info(`🔍 小説プロジェクト "${novelId}" のファイルを走査中...`);

    // VectorBackend を初期化
    await this.backend.initialize();

    // ターゲットファイルを検索（*.md, *.txt）
    const files = await this.findTargetFiles(novelId);
    this.logger.info(`📄 ${files.length} 個のファイルを発見`);

    let totalChunks = 0;

    // 各ファイルを処理
    for (const file of files) {
      try {
        const chunks = await this.processFile(file.filePath, novelId, file.fileType);
        totalChunks += chunks.length;
        this.logger.info(
          `  ✓ ${path.relative(this.projectRoot, file.filePath)}: ${chunks.length} チャンク (${file.fileType})`,
        );
      } catch (error) {
        this.logger.error(
          `  ✗ ${path.relative(this.projectRoot, file.filePath)}`,
          error instanceof Error ? error : undefined,
        );
      }
    }

    const duration = Date.now() - startTime;
    this.logger.info(
      `🎉 小説プロジェクト "${novelId}" のインデックス構築完了: ${totalChunks} チャンク, ${duration}ms`,
    );
  }

  /**
   * 単一ファイルを処理してチャンクを生成・追加
   * @param filePath 処理対象ファイルの絶対パス
   * @param novelId 小説プロジェクトID
   * @param fileType ファイルタイプ ('content' | 'settings')
   * @returns 生成されたチャンク配列
   */
  async processFile(
    filePath: string,
    novelId: string,
    fileType?: 'content' | 'settings',
  ): Promise<Chunk[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(this.projectRoot, filePath);

    // ファイルタイプが指定されていない場合は、パスから推定
    const determinedFileType = fileType || (await this.determineFileType(novelId, relativePath));

    // 既存のチャンクを削除（前のデータをクリア）
    try {
      await this.backend.removeByFile(relativePath);
    } catch (error) {
      // 削除処理が失敗しても処理を続行（例：該当するチャンクがない場合）
      this.logger.warn(`⚠️ 既存チャンクの削除に失敗しました（処理続行）: ${relativePath}`);
    }

    // チャンキング実行
    const chunks = this.chunkingStrategy.chunk(
      content,
      relativePath,
      this.config.chunk.maxTokens,
      this.config.chunk.overlap,
      novelId,
      determinedFileType,
    );

    // バックエンドに追加
    await this.backend.add(chunks);

    return chunks;
  }

  /**
   * ファイルパスからファイルタイプを推定
   * @param novelId 小説プロジェクトID
   * @param relativePath プロジェクトルートからの相対パス
   * @returns ファイルタイプ
   */
  private async determineFileType(
    novelId: string,
    relativePath: string,
  ): Promise<'content' | 'settings'> {
    try {
      const project = await this.novelRepository.getProject(novelId);

      // 設定ディレクトリに含まれるかチェック
      for (const settingsDir of project.config.settingsDirectories) {
        if (relativePath.startsWith(settingsDir + path.sep)) {
          return 'settings';
        }
      }

      // 本文ディレクトリに含まれるかチェック
      for (const contentDir of project.config.contentDirectories) {
        if (relativePath.startsWith(contentDir + path.sep)) {
          return 'content';
        }
      }

      // どちらにも該当しない場合は'content'をデフォルトとする
      this.logger.warn(
        `⚠️ ファイルタイプを判定できませんでした: ${relativePath}, デフォルトで'content'を使用`,
      );
      return 'content';
    } catch (error) {
      this.logger.warn(
        `⚠️ プロジェクト情報の取得に失敗しました: ${novelId}, デフォルトで'content'を使用`,
      );
      return 'content';
    }
  }

  /**
   * 特定の小説プロジェクトのターゲットファイル（本文・設定ファイル）を検索
   */
  private async findTargetFiles(novelId: string): Promise<FileWithType[]> {
    this.logger.info(`🔍 小説プロジェクト \"${novelId}\" のファイルを検索中...`);

    try {
      // NovelRepositoryを使用してプロジェクト情報を取得
      const project = await this.novelRepository.getProject(novelId);
      const targetFiles: FileWithType[] = [];

      // 設定ファイルを検索
      const settingsFiles = await this.getFilesFromDirectories(
        project.path,
        project.config.settingsDirectories,
        'settings',
      );
      targetFiles.push(...settingsFiles);

      // 本文ファイルを検索
      const contentFiles = await this.getFilesFromDirectories(
        project.path,
        project.config.contentDirectories,
        'content',
      );
      targetFiles.push(...contentFiles);

      this.logger.info(
        `📄 合計 ${targetFiles.length} 個のファイルを発見 (設定: ${settingsFiles.length}, 本文: ${contentFiles.length})`,
      );

      return targetFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));
    } catch (error) {
      this.logger.error(
        `❌ 小説プロジェクト \"${novelId}\" の検索に失敗しました`,
        error instanceof Error ? error : undefined,
      );
      return [];
    }
  }

  /**
   * 指定されたディレクトリからファイルを検索
   */
  private async getFilesFromDirectories(
    projectPath: string,
    directories: string[],
    fileType: 'content' | 'settings',
  ): Promise<FileWithType[]> {
    const files: FileWithType[] = [];
    const extensions = ['md', 'txt'];

    for (const dir of directories) {
      const fullDirPath = path.join(projectPath, dir);

      try {
        const stat = await fs.stat(fullDirPath);
        if (!stat.isDirectory()) {
          this.logger.warn(`⚠️ 指定されたディレクトリが存在しません: ${fullDirPath}`);
          continue;
        }

        const foundFiles = await findFilesRecursively(fullDirPath, extensions);

        for (const filePath of foundFiles) {
          files.push({
            filePath,
            fileType,
          });
        }

        this.logger.info(`  📁 ${dir}: ${foundFiles.length} 個のファイル`);
      } catch (error) {
        this.logger.warn(`⚠️ ディレクトリ "${dir}" の検索に失敗しました`);
        continue;
      }
    }

    return files;
  }

  /**
   * ファイル更新時の増分更新
   * @param filePath 更新対象ファイルの絶対パス
   * @param novelId 小説プロジェクトID
   */
  async updateFile(filePath: string, novelId: string): Promise<void> {
    try {
      // VectorBackend を初期化
      await this.backend.initialize();

      // processFile内で削除処理が実行されるため、ここでは削除は不要
      // processFileメソッドが削除→追加の順序で実行される

      // 新しいチャンクを追加（削除処理も含む）
      await this.processFile(filePath, novelId);

      const relativePath = path.relative(this.projectRoot, filePath);
      this.logger.info(`🔄 ファイルを更新しました: ${relativePath}`);
    } catch (error) {
      this.logger.error(
        `❌ ファイル更新エラー: ${filePath}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * ファイル削除時の処理
   * @param filePath 削除対象ファイルの絶対パス
   */
  async removeFile(filePath: string): Promise<void> {
    try {
      // 相対パスに変換して削除
      const relativePath = path.relative(this.projectRoot, filePath);
      await this.removeFileChunks(relativePath);
      this.logger.info(`🗑️ ファイルを削除しました: ${relativePath}`);
    } catch (error) {
      this.logger.error(
        `❌ ファイル削除エラー: ${filePath}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * 特定ファイルのチャンクを削除
   * @param filePath プロジェクトルートからの相対パス
   */
  private async removeFileChunks(filePath: string): Promise<void> {
    await this.backend.removeByFile(filePath);
  }

  /**
   * 検索機能をバックエンドに委譲
   */
  async search(
    query: string,
    k: number = this.config.search.defaultK,
    novelId: string,
    fileType?: string,
  ) {
    // VectorBackend を初期化
    await this.backend.initialize();
    return this.backend.search(query, k, novelId, fileType);
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
    // VectorBackend を初期化
    await this.backend.initialize();
    await this.backend.removeByNovel(novelId);
    this.logger.info(`🗑️ 小説プロジェクト "${novelId}" のインデックスを削除しました`);
  }

  /**
   * リソースのクリーンアップ
   */
  async cleanup(): Promise<void> {
    // 必要に応じてバックエンドのクリーンアップ処理
    await this.backend.dispose();
  }
}
