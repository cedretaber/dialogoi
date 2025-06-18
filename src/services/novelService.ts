import fs from 'fs/promises';
import path from 'path';
import { MCPRequest, MCPResponse, NovelConfig, NovelProject } from '../types/novel';

export class NovelService {
  private readonly baseDir: string;
  private novelProjects: Map<string, NovelProject> = new Map();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'novels');
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
              config: config
            };
            
            this.novelProjects.set(entry.name, project);
          } catch (error) {
            // novel.json が無い、または読み込めないディレクトリはスキップ
            continue;
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to discover novel projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 指定ディレクトリ内のファイルを再帰的に検索
  private async findFilesRecursively(dirPath: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // サブディレクトリも検索
          const subFiles = await this.findFilesRecursively(fullPath, extensions);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // ディレクトリが存在しない場合はスキップ
    }
    
    return files;
  }

  // ファイル内からキーワードを検索する共通メソッド
  private async searchFiles(
    novelId: string, 
    keyword: string, 
    directories: string[], 
    extensions: string[]
  ): Promise<Array<{filename: string, matchingLines: string[]}>> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }
    
    const searchResults: Array<{filename: string, matchingLines: string[]}> = [];
    
    // 指定されたディレクトリから全ファイルを検索
    for (const directory of directories) {
      const fullDirectoryPath = path.join(project.path, directory);
      const files = await this.findFilesRecursively(fullDirectoryPath, extensions);
      
      for (const filePath of files) {
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const lines = data.split('\n');
          const matchingLines: string[] = [];
          
          // キーワードを含む行を検索（大文字小文字を区別しない）
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(keyword.toLowerCase())) {
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
              matchingLines: matchingLines
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
  async listNovelProjects(): Promise<Array<{id: string, title: string, description?: string}>> {
    await this.discoverNovelProjects();
    
    const projects: Array<{id: string, title: string, description?: string}> = [];
    
    for (const [id, project] of this.novelProjects) {
      projects.push({
        id: id,
        title: project.config.title,
        description: project.config.description
      });
    }
    
    return projects;
  }

  async listNovelSettings(novelId: string): Promise<Array<{filename: string, preview: string}>> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }
    
    const extensions = ['md', 'txt'];
    const settingsFiles: Array<{filename: string, preview: string}> = [];
    
    // 設定ディレクトリから全ファイルを検索
    for (const settingsDir of project.config.settingsDirectories) {
      const fullSettingsPath = path.join(project.path, settingsDir);
      const files = await this.findFilesRecursively(fullSettingsPath, extensions);
      
      for (const filePath of files) {
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const lines = data.split('\n');
          const preview = lines.slice(0, 3).join('\n');
          const relativePath = path.relative(project.path, filePath);
          
          settingsFiles.push({
            filename: relativePath,
            preview: preview
          });
        } catch (error) {
          // このファイルが読めない場合はスキップ
          continue;
        }
      }
    }
    
    return settingsFiles;
  }

  async getNovelSettings(novelId: string, filename?: string): Promise<string> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }
    
    if (filename) {
      // 特定のファイル名が指定された場合（プロジェクト相対パス）
      const filePath = path.join(project.path, filename);
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        return data;
      } catch (error) {
        throw new Error(`Failed to read novel settings file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // 設定ディレクトリから全ファイルを結合して返す
      const extensions = ['md', 'txt'];
      let allSettings = '';
      
      for (const settingsDir of project.config.settingsDirectories) {
        const fullSettingsPath = path.join(project.path, settingsDir);
        const files = await this.findFilesRecursively(fullSettingsPath, extensions);
        
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

  async searchNovelSettings(novelId: string, keyword: string): Promise<Array<{filename: string, matchingLines: string[]}>> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }
    
    const extensions = ['md', 'txt'];
    return this.searchFiles(novelId, keyword, project.config.settingsDirectories, extensions);
  }

  async searchNovelContent(novelId: string, keyword: string): Promise<Array<{filename: string, matchingLines: string[]}>> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }
    
    const extensions = ['txt', 'md'];
    return this.searchFiles(novelId, keyword, project.config.contentDirectories, extensions);
  }

  async getNovelContent(novelId: string, filename?: string): Promise<string> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }
    
    if (filename) {
      // 特定のファイル名が指定された場合（プロジェクト相対パス）
      const filePath = path.join(project.path, filename);
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        return data;
      } catch (error) {
        throw new Error(`Failed to read novel content file ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // 本文ディレクトリから全ファイルを結合して返す
      const extensions = ['txt', 'md'];
      let allContent = '';
      
      for (const contentDir of project.config.contentDirectories) {
        const fullContentPath = path.join(project.path, contentDir);
        const files = await this.findFilesRecursively(fullContentPath, extensions);
        
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
  async listNovelContent(novelId: string): Promise<Array<{filename: string, preview: string}>> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }
    
    const extensions = ['txt', 'md'];
    const contentFiles: Array<{filename: string, preview: string}> = [];
    
    // 本文ディレクトリから全ファイルを検索
    for (const contentDir of project.config.contentDirectories) {
      const fullContentPath = path.join(project.path, contentDir);
      const files = await this.findFilesRecursively(fullContentPath, extensions);
      
      for (const filePath of files) {
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const lines = data.split('\n');
          const preview = lines.slice(0, 3).join('\n');
          const relativePath = path.relative(project.path, filePath);
          
          contentFiles.push({
            filename: relativePath,
            preview: preview
          });
        } catch (error) {
          // このファイルが読めない場合はスキップ
          continue;
        }
      }
    }
    
    return contentFiles.sort((a, b) => a.filename.localeCompare(b.filename));
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

    // ファイル名の文字制限（英数字、日本語、ハイフン、アンダースコア、ドットのみ）
    const validFilenameRegex = /^[a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF_\-\.]+$/;
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
      throw new Error(`ファイルサイズが制限を超えています（最大: ${Math.round(maxSize / 1024 / 1024)}MB）`);
    }

    // 内容の検証
    if (content.length === 0) {
      throw new Error('ファイル内容が空です');
    }
  }

  // 設定ファイルを追加
  async addNovelSetting(novelId: string, directory: string, filename: string, content: string, overwrite: boolean = false): Promise<void> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }

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
    await fs.mkdir(targetDir, { recursive: true });

    // 既存ファイルのチェック
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch (accessError) {
      // ファイルが存在しない場合は正常（新規作成）
      fileExists = false;
    }

    if (fileExists && !overwrite) {
      throw new Error(`File '${filename}' already exists. Set overwrite=true to replace it.`);
    }

    // ファイル作成
    await fs.writeFile(filePath, content, 'utf-8');
  }

  // 本文ファイルを追加
  async addNovelContent(novelId: string, directory: string, filename: string, content: string, overwrite: boolean = false): Promise<void> {
    await this.discoverNovelProjects();
    
    const project = this.novelProjects.get(novelId);
    if (!project) {
      throw new Error(`Novel project '${novelId}' not found`);
    }

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
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch (accessError) {
      // ファイルが存在しない場合は正常（新規作成）
      fileExists = false;
    }

    if (fileExists && !overwrite) {
      throw new Error(`File '${filename}' already exists. Set overwrite=true to replace it.`);
    }

    // ファイル作成
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      if (request.type === 'settings') {
        const settings = await this.getNovelSettings(request.novelId);
        return { success: true, data: settings };
      } else if (request.type === 'content') {
        // chapter パラメータは廃止、ファイル名を直接指定する形式に変更
        const content = await this.getNovelContent(request.novelId);
        return { success: true, data: content };
      }
      return { success: false, error: 'Invalid request type' };
    } catch (error) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Unknown error occurred' };
    }
  }
} 
