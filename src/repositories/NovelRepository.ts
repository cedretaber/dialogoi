import { NovelProject } from '../domain/novel.js';

/**
 * 小説プロジェクトのデータアクセスを抽象化するRepository
 */
export interface NovelRepository {
  /**
   * 利用可能な小説プロジェクト一覧を取得
   */
  listProjects(): Promise<Array<{ id: string; title: string; description?: string }>>;

  /**
   * 指定されたIDの小説プロジェクトを取得
   * @param projectId プロジェクトID
   * @throws ProjectNotFoundError プロジェクトが見つからない場合
   */
  getProject(projectId: string): Promise<NovelProject>;

  /**
   * 設定ファイル一覧をプレビュー付きで取得
   * @param projectId プロジェクトID
   */
  listSettingsFiles(projectId: string): Promise<Array<{ filename: string; preview: string }>>;

  /**
   * 設定ファイルの内容を取得
   * @param projectId プロジェクトID
   * @param filename ファイル名（省略時は全ファイル結合）
   */
  getSettingsContent(projectId: string, filename?: string): Promise<string>;

  /**
   * 設定ファイル内でキーワード検索
   * @param projectId プロジェクトID
   * @param keyword 検索キーワード
   * @param useRegex 正規表現を使用するか
   */
  searchSettingsFiles(
    projectId: string,
    keyword: string,
    useRegex?: boolean,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>>;

  /**
   * 本文ファイル一覧をプレビュー付きで取得
   * @param projectId プロジェクトID
   */
  listContentFiles(projectId: string): Promise<Array<{ filename: string; preview: string }>>;

  /**
   * 本文ファイルの内容を取得
   * @param projectId プロジェクトID
   * @param filename ファイル名（省略時は全ファイル結合）
   */
  getContentFiles(projectId: string, filename?: string): Promise<string>;

  /**
   * 本文ファイル内でキーワード検索
   * @param projectId プロジェクトID
   * @param keyword 検索キーワード
   * @param useRegex 正規表現を使用するか
   */
  searchContentFiles(
    projectId: string,
    keyword: string,
    useRegex?: boolean,
  ): Promise<Array<{ filename: string; matchingLines: string[] }>>;

  /**
   * 指示ファイル一覧をプレビュー付きで取得
   * @param projectId プロジェクトID
   */
  listInstructionFiles(projectId: string): Promise<Array<{ filename: string; preview: string }>>;

  /**
   * 指示ファイルの内容を取得
   * @param projectId プロジェクトID
   * @param filename ファイル名（省略時は全ファイル結合）
   */
  getInstructionFiles(projectId: string, filename?: string): Promise<string>;

  /**
   * 設定ファイルを作成
   * @param projectId プロジェクトID
   * @param directory 作成先ディレクトリ
   * @param filename ファイル名
   * @param content ファイル内容
   * @param overwrite 上書きするか
   */
  createSettingsFile(
    projectId: string,
    directory: string,
    filename: string,
    content: string,
    overwrite?: boolean,
  ): Promise<void>;

  /**
   * 本文ファイルを作成
   * @param projectId プロジェクトID
   * @param directory 作成先ディレクトリ
   * @param filename ファイル名
   * @param content ファイル内容
   * @param overwrite 上書きするか
   */
  createContentFile(
    projectId: string,
    directory: string,
    filename: string,
    content: string,
    overwrite?: boolean,
  ): Promise<void>;
}
