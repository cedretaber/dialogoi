import fs from 'fs/promises';
import path from 'path';
import { NovelConfig, NovelProject } from '../domain/novel.js';
import { fileExists, findFilesRecursively, ensureDirectory } from '../utils/fileUtils.js';
import { IndexerManager } from '../lib/indexerManager.js';
import { DialogoiConfig } from '../lib/config.js';

export class NovelService {
  private readonly baseDir: string;
  private novelProjects: Map<string, NovelProject> = new Map();
  private indexerManager: IndexerManager;

  constructor(baseDir?: string, config?: DialogoiConfig) {
    this.baseDir = baseDir || path.join(process.cwd(), 'novels');

    // IndexerManagerを内部で初期化
    if (config) {
      this.indexerManager = new IndexerManager(config);
    } else {
      // configが提供されない場合は後で設定
      this.indexerManager = null as unknown as IndexerManager;
    }
  }

  /**
   * IndexerManagerを設定（後方互換性のため）
   * @param indexerManager IndexerManager インスタンス
   */
  setIndexerManager(indexerManager: IndexerManager): void {
    this.indexerManager = indexerManager;
  }

  /**
   * RAG検索を実行
   * @param novelId 小説ID
   * @param query 検索クエリ
   * @param k 取得する結果数
   * @returns 検索結果
   */
  async searchRag(novelId: string, query: string, k: number) {
    if (!this.indexerManager) {
      throw new Error('IndexerManager が設定されていません');
    }
    return this.indexerManager.search(novelId, query, k);
  }

  // 小説プロジェクトを発見・読み込み
  async discoverNovelProjects(): Promise<void> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const novelPath = path.join(this.baseDir, entry.name);
          const configPath = path.join(novelPath, 'novel.json');

          try {
            // novel.json の存在確認
            const configData = await fs.readFile(configPath, 'utf-8');
            const config: NovelConfig = JSON.parse(configData);

            const project: NovelProject = {
              id: entry.name,
              path: novelPath,
              config: config,
            };

            this.novelProjects.set(entry.name, project);
          } catch (error) {
            // novel.json が無い、または読み込めないディレクトリはスキップ
            continue;
          }
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to discover novel projects: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ファイル内からキーワードを検索する共通メソッド
  private async searchFiles(
    novelId: string,
    keyword: string,
    directories: string[],
    extensions: string[],
    useRegex: boolean = false,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>> {
    const project = await this.getValidatedProject(novelId);

    const searchResults: Array<{ filename: string; matchingLines: string[] }> = [];

    // 正規表現パターンを作成
    let searchPattern: RegExp;
    if (useRegex) {
      try {
        searchPattern = new RegExp(keyword, 'i'); // 大文字小文字を区別しない
      } catch (error) {
        throw new Error(`無効な正規表現: ${keyword}`);
      }
    } else {
      // 通常の文字列検索の場合は、正規表現特殊文字をエスケープ
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      searchPattern = new RegExp(escapedKeyword, 'i');
    }

    // 指定されたディレクトリから全ファイルを検索
    for (const directory of directories) {
      const fullDirectoryPath = path.join(project.path, directory);
      const files = await findFilesRecursively(fullDirectoryPath, extensions);

      for (const filePath of files) {
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const lines = data.split('\n');
          const matchingLines: string[] = [];

          // パターンに一致する行を検索
          for (let i = 0; i < lines.length; i++) {
            if (searchPattern.test(lines[i])) {
              // マッチした行とその前後の文脈を含める
              const contextStart = Math.max(0, i - 1);
              const contextEnd = Math.min(lines.length - 1, i + 1);
              const contextLines = lines.slice(contextStart, contextEnd + 1);
              matchingLines.push(`行${i + 1}: ${contextLines.join('\n')}`);
            }
          }

          if (matchingLines.length > 0) {
            const relativePath = path.relative(project.path, filePath);
            searchResults.push({
              filename: relativePath,
              matchingLines: matchingLines,
            });
          }
        } catch (error) {
          // このファイルが読めない場合はスキップ
          continue;
        }
      }
    }

    return searchResults;
  }

  // 小説プロジェクト一覧を取得
  async listNovelProjects(): Promise<Array<{ id: string; title: string; description?: string }>> {
    await this.discoverNovelProjects();

    const projects: Array<{ id: string; title: string; description?: string }> = [];

    for (const [id, project] of this.novelProjects) {
      projects.push({
        id: id,
        title: project.config.title,
        description: project.config.description,
      });
    }

    return projects;
  }

  async listNovelSettings(novelId: string): Promise<Array<{ filename: string; preview: string }>> {
    const project = await this.getValidatedProject(novelId);
    const extensions = ['md', 'txt'];
    return this.listFilesInDirectories(project, project.config.settingsDirectories, extensions);
  }

  async getNovelSettings(novelId: string, filename?: string): Promise<string> {
    const project = await this.getValidatedProject(novelId);

    if (filename) {
      // 特定のファイル名が指定された場合（プロジェクト相対パス）
      const filePath = path.join(project.path, filename);
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        return data;
      } catch (error) {
        throw new Error(
          `Failed to read novel settings file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    } else {
      // 設定ディレクトリから全ファイルを結合して返す
      const extensions = ['md', 'txt'];
      let allSettings = '';

      for (const settingsDir of project.config.settingsDirectories) {
        const fullSettingsPath = path.join(project.path, settingsDir);
        const files = await findFilesRecursively(fullSettingsPath, extensions);

        for (const filePath of files) {
          try {
            const data = await fs.readFile(filePath, 'utf-8');
            const relativePath = path.relative(project.path, filePath);
            allSettings += `=== ${relativePath} ===\n${data}\n\n`;
          } catch (error) {
            // このファイルが読めない場合はスキップ
            continue;
          }
        }
      }

      if (allSettings === '') {
        throw new Error(`No settings files found for novel '${novelId}'`);
      }

      return allSettings;
    }
  }

  async searchNovelSettings(
    novelId: string,
    keyword: string,
    useRegex: boolean = false,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>> {
    const project = await this.getValidatedProject(novelId);
    const extensions = ['md', 'txt'];
    return this.searchFiles(
      novelId,
      keyword,
      project.config.settingsDirectories,
      extensions,
      useRegex,
    );
  }

  async searchNovelContent(
    novelId: string,
    keyword: string,
    useRegex: boolean = false,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>> {
    const project = await this.getValidatedProject(novelId);
    const extensions = ['txt', 'md'];
    return this.searchFiles(
      novelId,
      keyword,
      project.config.contentDirectories,
      extensions,
      useRegex,
    );
  }

  async getNovelContent(novelId: string, filename?: string): Promise<string> {
    const project = await this.getValidatedProject(novelId);

    if (filename) {
      // 特定のファイル名が指定された場合（プロジェクト相対パス）
      const filePath = path.join(project.path, filename);
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        return data;
      } catch (error) {
        throw new Error(
          `Failed to read novel content file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    } else {
      // 本文ディレクトリから全ファイルを結合して返す
      const extensions = ['txt', 'md'];
      let allContent = '';

      for (const contentDir of project.config.contentDirectories) {
        const fullContentPath = path.join(project.path, contentDir);
        const files = await findFilesRecursively(fullContentPath, extensions);

        // ファイル名でソート（章順序を保持）
        files.sort();

        for (const filePath of files) {
          try {
            const data = await fs.readFile(filePath, 'utf-8');
            const relativePath = path.relative(project.path, filePath);
            allContent += `=== ${relativePath} ===\n${data}\n\n`;
          } catch (error) {
            // このファイルが読めない場合はスキップ
            continue;
          }
        }
      }

      if (allContent === '') {
        throw new Error(`No content files found for novel '${novelId}'`);
      }

      return allContent;
    }
  }

  // 本文ファイル一覧を取得
  async listNovelContent(novelId: string): Promise<Array<{ filename: string; preview: string }>> {
    const project = await this.getValidatedProject(novelId);
    const extensions = ['txt', 'md'];
    const contentFiles = await this.listFilesInDirectories(
      project,
      project.config.contentDirectories,
      extensions,
    );
    return contentFiles.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  // ===== 指示ファイル（AI Instructions）操作 =====

  /**
   * プロジェクト配下の指示ファイル一覧（プレビュー付き）を取得
   */
  async listNovelInstructions(
    novelId: string,
  ): Promise<Array<{ filename: string; preview: string }>> {
    const project = await this.getValidatedProject(novelId);

    const candidates = this.getInstructionFileCandidates(project);
    const results: Array<{ filename: string; preview: string }> = [];

    for (const relative of candidates) {
      const filePath = path.join(project.path, relative);
      const exists = await this.fileExists(filePath);
      if (!exists) continue;

      try {
        const { preview } = await this.readFileWithPreview(filePath, project.path);
        results.push({ filename: relative, preview });
      } catch {
        // 読み込み失敗はスキップ
        continue;
      }
    }

    return results;
  }

  /**
   * 指示ファイルの内容を取得
   * filename を省略すると候補ファイルをすべて結合して返す
   */
  async getNovelInstructions(novelId: string, filename?: string): Promise<string> {
    const project = await this.getValidatedProject(novelId);
    const candidates = this.getInstructionFileCandidates(project);

    if (filename) {
      const targetPath = path.join(project.path, filename);
      try {
        const data = await fs.readFile(targetPath, 'utf-8');
        return data;
      } catch (error) {
        throw new Error(
          `Failed to read instruction file '${filename}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // filename が無い場合は候補をすべて結合
    let combined = '';
    for (const relative of candidates) {
      const targetPath = path.join(project.path, relative);
      const exists = await this.fileExists(targetPath);
      if (!exists) continue;
      try {
        const data = await fs.readFile(targetPath, 'utf-8');
        combined += `=== ${relative} ===\n${data}\n\n`;
      } catch {
        continue;
      }
    }

    if (combined === '') {
      throw new Error(`No instruction files found for novel '${novelId}'`);
    }

    return combined;
  }

  /** 候補となる指示ファイルリストを返す */
  private getInstructionFileCandidates(project: NovelProject): string[] {
    if (project.config.instructionFiles && project.config.instructionFiles.length > 0) {
      return project.config.instructionFiles;
    }
    return ['DIALOGOI.md'];
  }

  // セキュリティチェック関数
  private validateFileInput(filename: string, content: string): void {
    // ファイル名の検証
    if (!filename || filename.trim() === '') {
      throw new Error('ファイル名が指定されていません');
    }

    // パストラバーサル攻撃の防止
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('ファイル名に不正な文字が含まれています');
    }

    const validFilenameRegex = /^[a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF_\-.]+$/;
    if (!validFilenameRegex.test(filename)) {
      throw new Error('ファイル名に使用できない文字が含まれています');
    }

    // 拡張子の制限
    const allowedExtensions = ['.md', '.txt'];
    const ext = path.extname(filename).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      throw new Error('許可されていない拡張子です（.md, .txt のみ許可）');
    }

    // ファイルサイズ制限（10MB）
    const maxSize = 10 * 1024 * 1024;
    const contentBytes = Buffer.byteLength(content, 'utf8');
    if (contentBytes > maxSize) {
      throw new Error(
        `ファイルサイズが制限を超えています（最大: ${Math.round(maxSize / 1024 / 1024)}MB）`,
      );
    }

    // 内容の検証
    if (content.length === 0) {
      throw new Error('ファイル内容が空です');
    }
  }

  // 設定ファイルを追加
  async addNovelSetting(
    novelId: string,
    directory: string,
    filename: string,
    content: string,
    overwrite: boolean = false,
  ): Promise<void> {
    const project = await this.getValidatedProject(novelId);

    // セキュリティチェック
    this.validateFileInput(filename, content);

    // ディレクトリが設定ディレクトリに含まれているかチェック
    if (!project.config.settingsDirectories.includes(directory)) {
      throw new Error(`Directory '${directory}' is not configured as a settings directory`);
    }

    // ファイルパスの構築
    const targetDir = path.join(project.path, directory);
    const filePath = path.join(targetDir, filename);

    // ディレクトリが存在しない場合は作成
    await ensureDirectory(targetDir);

    // 既存ファイルのチェック
    const exists = await fileExists(filePath);
    if (exists && !overwrite) {
      throw new Error(`File '${filename}' already exists. Set overwrite=true to replace it.`);
    }

    // ファイル作成
    await fs.writeFile(filePath, content, 'utf-8');

    // IndexerManagerが設定されている場合、インデックスを更新
    if (this.indexerManager) {
      try {
        await this.indexerManager.updateFile(novelId, filePath);
      } catch (error) {
        console.error(`⚠️ Indexer更新エラー: ${filePath}`, error);
      }
    }
  }

  // 本文ファイルを追加
  async addNovelContent(
    novelId: string,
    directory: string,
    filename: string,
    content: string,
    overwrite: boolean = false,
  ): Promise<void> {
    const project = await this.getValidatedProject(novelId);

    // セキュリティチェック
    this.validateFileInput(filename, content);

    // ディレクトリが本文ディレクトリに含まれているかチェック
    if (!project.config.contentDirectories.includes(directory)) {
      throw new Error(`Directory '${directory}' is not configured as a content directory`);
    }

    // ファイルパスの構築
    const targetDir = path.join(project.path, directory);
    const filePath = path.join(targetDir, filename);

    // ディレクトリが存在しない場合は作成
    await fs.mkdir(targetDir, { recursive: true });

    // 既存ファイルのチェック
    const exists = await this.fileExists(filePath);
    if (exists && !overwrite) {
      throw new Error(`File '${filename}' already exists. Set overwrite=true to replace it.`);
    }

    // ファイル作成
    await fs.writeFile(filePath, content, 'utf-8');

    // IndexerManagerが設定されている場合、インデックスを更新
    if (this.indexerManager) {
      try {
        await this.indexerManager.updateFile(novelId, filePath);
      } catch (error) {
        console.error(`⚠️ Indexer更新エラー: ${filePath}`, error);
      }
    }
  }

  // ===== 共通メソッド =====

  // プロジェクトを取得して検証する共通メソッド
  private async getValidatedProject(novelId: string): Promise<NovelProject> {
    await this.discoverNovelProjects();

    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }

    return project;
  }

  // ファイルの存在を確認する共通メソッド
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ファイルを読み込んでプレビューを生成する共通メソッド
  private async readFileWithPreview(
    filePath: string,
    projectPath: string,
    previewLines: number = 3,
  ): Promise<{
    relativePath: string;
    content: string;
    preview: string;
  }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const preview = lines.slice(0, previewLines).join('\n');
    const relativePath = path.relative(projectPath, filePath);

    return {
      relativePath,
      content,
      preview,
    };
  }

  // ディレクトリ内のファイルを検索してリストを作成する共通メソッド
  private async listFilesInDirectories(
    project: NovelProject,
    directories: string[],
    extensions: string[],
  ): Promise<Array<{ filename: string; preview: string }>> {
    const files: Array<{ filename: string; preview: string }> = [];

    for (const directory of directories) {
      const fullPath = path.join(project.path, directory);
      const foundFiles = await findFilesRecursively(fullPath, extensions);

      for (const filePath of foundFiles) {
        try {
          const fileData = await this.readFileWithPreview(filePath, project.path);
          files.push({
            filename: fileData.relativePath,
            preview: fileData.preview,
          });
        } catch (error) {
          // このファイルが読めない場合はスキップ
          continue;
        }
      }
    }

    return files;
  }
}
