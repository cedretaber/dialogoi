export interface NovelConfig {
  title: string;
  author?: string;
  description?: string;
  settingsDirectories: string[]; // 設定ファイルが入っているディレクトリ
  contentDirectories: string[]; // 本文ファイルが入っているディレクトリ
  /**
   * 生成 AI に渡す追加指示ファイル。
   * 指定がなければプロジェクト直下の "DIALOGOI.md" を自動検出します。
   */
  instructionFiles?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface NovelProject {
  id: string; // ディレクトリ名
  path: string; // フルパス
  config: NovelConfig; // novel.json の内容
}
