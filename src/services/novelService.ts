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
    const searchResults: Array<{filename: string, matchingLines: string[]}> = [];
    
    // 設定ディレクトリから全ファイルを検索
    for (const settingsDir of project.config.settingsDirectories) {
      const fullSettingsPath = path.join(project.path, settingsDir);
      const files = await this.findFilesRecursively(fullSettingsPath, extensions);
      
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
