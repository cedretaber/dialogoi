import fs from 'fs/promises';
import path from 'path';
import { NovelConfig, NovelProject } from '../domain/novel.js';
import { fileExists, findFilesRecursively, ensureDirectory } from '../utils/fileUtils.js';
import { ProjectNotFoundError, ConfigurationError } from '../errors/index.js';
import { getLogger } from '../logging/index.js';
import { NovelRepository } from './NovelRepository.js';

/**
 * ファイルシステムベースの小説プロジェクトRepository実装
 */
export class FileSystemNovelRepository implements NovelRepository {
  private readonly baseDir: string;
  private novelProjects: Map<string, NovelProject> = new Map();
  private readonly logger = getLogger();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'novels');
    this.logger.debug('FileSystemNovelRepository初期化', { baseDir: this.baseDir });
  }

  async listProjects(): Promise<Array<{ id: string; title: string; description?: string }>> {
    await this.discoverProjects();

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

  async getProject(projectId: string): Promise<NovelProject> {
    await this.discoverProjects();

    const project = this.novelProjects.get(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    return project;
  }

  async listSettingsFiles(
    projectId: string,
  ): Promise<Array<{ filename: string; preview: string }>> {
    const project = await this.getProject(projectId);
    const extensions = ['md', 'txt'];
    return this.listFilesInDirectories(project, project.config.settingsDirectories, extensions);
  }

  async getSettingsContent(projectId: string, filename?: string): Promise<string> {
    const project = await this.getProject(projectId);

    if (filename) {
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
            continue;
          }
        }
      }

      if (allSettings === '') {
        throw new Error(`No settings files found for novel '${projectId}'`);
      }

      return allSettings;
    }
  }

  async searchSettingsFiles(
    projectId: string,
    keyword: string,
    useRegex: boolean = false,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>> {
    const project = await this.getProject(projectId);
    const extensions = ['md', 'txt'];
    return this.searchFiles(
      projectId,
      keyword,
      project.config.settingsDirectories,
      extensions,
      useRegex,
    );
  }

  async listContentFiles(projectId: string): Promise<Array<{ filename: string; preview: string }>> {
    const project = await this.getProject(projectId);
    const extensions = ['txt', 'md'];
    const contentFiles = await this.listFilesInDirectories(
      project,
      project.config.contentDirectories,
      extensions,
    );
    return contentFiles.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  async getContentFiles(projectId: string, filename?: string): Promise<string> {
    const project = await this.getProject(projectId);

    if (filename) {
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
      const extensions = ['txt', 'md'];
      let allContent = '';

      for (const contentDir of project.config.contentDirectories) {
        const fullContentPath = path.join(project.path, contentDir);
        const files = await findFilesRecursively(fullContentPath, extensions);

        files.sort();

        for (const filePath of files) {
          try {
            const data = await fs.readFile(filePath, 'utf-8');
            const relativePath = path.relative(project.path, filePath);
            allContent += `=== ${relativePath} ===\n${data}\n\n`;
          } catch (error) {
            continue;
          }
        }
      }

      if (allContent === '') {
        throw new Error(`No content files found for novel '${projectId}'`);
      }

      return allContent;
    }
  }

  async searchContentFiles(
    projectId: string,
    keyword: string,
    useRegex: boolean = false,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>> {
    const project = await this.getProject(projectId);
    const extensions = ['txt', 'md'];
    return this.searchFiles(
      projectId,
      keyword,
      project.config.contentDirectories,
      extensions,
      useRegex,
    );
  }

  async listInstructionFiles(
    projectId: string,
  ): Promise<Array<{ filename: string; preview: string }>> {
    const project = await this.getProject(projectId);

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
        continue;
      }
    }

    return results;
  }

  async getInstructionFiles(projectId: string, filename?: string): Promise<string> {
    const project = await this.getProject(projectId);
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
      throw new Error(`No instruction files found for novel '${projectId}'`);
    }

    return combined;
  }

  async createSettingsFile(
    projectId: string,
    directory: string,
    filename: string,
    content: string,
    overwrite: boolean = false,
  ): Promise<void> {
    const project = await this.getProject(projectId);

    this.validateFileInput(filename, content);

    if (!project.config.settingsDirectories.includes(directory)) {
      throw new Error(`Directory '${directory}' is not configured as a settings directory`);
    }

    const targetDir = path.join(project.path, directory);
    const filePath = path.join(targetDir, filename);

    await ensureDirectory(targetDir);

    const exists = await fileExists(filePath);
    if (exists && !overwrite) {
      throw new Error(`File '${filename}' already exists. Set overwrite=true to replace it.`);
    }

    await fs.writeFile(filePath, content, 'utf-8');
    this.logger.debug('設定ファイル作成', { projectId, filePath });
  }

  async createContentFile(
    projectId: string,
    directory: string,
    filename: string,
    content: string,
    overwrite: boolean = false,
  ): Promise<void> {
    const project = await this.getProject(projectId);

    this.validateFileInput(filename, content);

    if (!project.config.contentDirectories.includes(directory)) {
      throw new Error(`Directory '${directory}' is not configured as a content directory`);
    }

    const targetDir = path.join(project.path, directory);
    const filePath = path.join(targetDir, filename);

    await fs.mkdir(targetDir, { recursive: true });

    const exists = await this.fileExists(filePath);
    if (exists && !overwrite) {
      throw new Error(`File '${filename}' already exists. Set overwrite=true to replace it.`);
    }

    await fs.writeFile(filePath, content, 'utf-8');
    this.logger.debug('本文ファイル作成', { projectId, filePath });
  }

  // ===== Private Methods =====

  /**
   * 小説プロジェクトを発見・読み込み
   */
  private async discoverProjects(): Promise<void> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const novelPath = path.join(this.baseDir, entry.name);
          const configPath = path.join(novelPath, 'novel.json');

          try {
            const configData = await fs.readFile(configPath, 'utf-8');
            const config: NovelConfig = JSON.parse(configData);

            const project: NovelProject = {
              id: entry.name,
              path: novelPath,
              config: config,
            };

            this.novelProjects.set(entry.name, project);
            this.logger.debug('プロジェクト発見', { id: entry.name, path: novelPath });
          } catch (error) {
            this.logger.debug('プロジェクト設定読み込み失敗（スキップ）', {
              id: entry.name,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }
        }
      }
    } catch (error) {
      throw new ConfigurationError(
        `プロジェクト探索に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PROJECT_DISCOVERY_FAILED',
        { baseDir: this.baseDir },
      );
    }
  }

  /**
   * ファイル内からキーワードを検索
   */
  private async searchFiles(
    novelId: string,
    keyword: string,
    directories: string[],
    extensions: string[],
    useRegex: boolean = false,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>> {
    const project = await this.getProject(novelId);

    const searchResults: Array<{ filename: string; matchingLines: string[] }> = [];

    let searchPattern: RegExp;
    if (useRegex) {
      try {
        searchPattern = new RegExp(keyword, 'i');
      } catch (error) {
        throw new Error(`無効な正規表現: ${keyword}`);
      }
    } else {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      searchPattern = new RegExp(escapedKeyword, 'i');
    }

    for (const directory of directories) {
      const fullDirectoryPath = path.join(project.path, directory);
      const files = await findFilesRecursively(fullDirectoryPath, extensions);

      for (const filePath of files) {
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const lines = data.split('\n');
          const matchingLines: string[] = [];

          for (let i = 0; i < lines.length; i++) {
            if (searchPattern.test(lines[i])) {
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
          continue;
        }
      }
    }

    return searchResults;
  }

  /**
   * ディレクトリ内のファイルを検索してリストを作成
   */
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
          continue;
        }
      }
    }

    return files;
  }

  /**
   * 候補となる指示ファイルリストを返す
   */
  private getInstructionFileCandidates(project: NovelProject): string[] {
    if (project.config.instructionFiles && project.config.instructionFiles.length > 0) {
      return project.config.instructionFiles;
    }
    return ['DIALOGOI.md'];
  }

  /**
   * セキュリティチェック
   */
  private validateFileInput(filename: string, content: string): void {
    if (!filename || filename.trim() === '') {
      throw new Error('ファイル名が指定されていません');
    }

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('ファイル名に不正な文字が含まれています');
    }

    const validFilenameRegex = /^[a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF_\-.]+$/;
    if (!validFilenameRegex.test(filename)) {
      throw new Error('ファイル名に使用できない文字が含まれています');
    }

    const allowedExtensions = ['.md', '.txt'];
    const ext = path.extname(filename).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      throw new Error('許可されていない拡張子です（.md, .txt のみ許可）');
    }

    const maxSize = 10 * 1024 * 1024;
    const contentBytes = Buffer.byteLength(content, 'utf8');
    if (contentBytes > maxSize) {
      throw new Error(
        `ファイルサイズが制限を超えています（最大: ${Math.round(maxSize / 1024 / 1024)}MB）`,
      );
    }

    if (content.length === 0) {
      throw new Error('ファイル内容が空です');
    }
  }

  /**
   * ファイルの存在を確認
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ファイルを読み込んでプレビューを生成
   */
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
}
