export interface NovelConfig {
  title: string;
  author?: string;
  description?: string;
  settingsDirectories: string[]; // 設定ファイルが入っているディレクトリ
  contentDirectories: string[];  // 本文ファイルが入っているディレクトリ
  createdAt?: string;
  updatedAt?: string;
}

export interface NovelProject {
  id: string;           // ディレクトリ名
  path: string;         // フルパス
  config: NovelConfig;  // novel.json の内容
} 
