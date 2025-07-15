/**
 * ファイル作成オプション
 */
export interface FileCreationOptions {
  /** 上書きを許可するか */
  overwrite?: boolean;
}

/**
 * ファイル操作を提供するサービス
 */
export interface FileOperationsService {
  /**
   * 設定ファイルを作成
   * @param projectId プロジェクトID
   * @param directory 作成先ディレクトリ
   * @param filename ファイル名
   * @param content ファイル内容
   * @param options 作成オプション
   */
  createSettingsFile(
    projectId: string,
    directory: string,
    filename: string,
    content: string,
    options?: FileCreationOptions,
  ): Promise<void>;

  /**
   * 本文ファイルを作成
   * @param projectId プロジェクトID
   * @param directory 作成先ディレクトリ
   * @param filename ファイル名
   * @param content ファイル内容
   * @param options 作成オプション
   */
  createContentFile(
    projectId: string,
    directory: string,
    filename: string,
    content: string,
    options?: FileCreationOptions,
  ): Promise<void>;

  /**
   * インデックスの更新通知
   * @param projectId プロジェクトID
   * @param filePath 更新されたファイルパス
   */
  notifyFileUpdate(projectId: string, filePath: string): Promise<void>;
}
