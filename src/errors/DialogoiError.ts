/**
 * Dialogoi システム共通のベースエラークラス
 */
export class DialogoiError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'DialogoiError';
    this.code = code;
    this.context = context;

    // Errorのプロトタイプチェーンを正しく設定
    Object.setPrototypeOf(this, DialogoiError.prototype);
  }

  /**
   * エラー情報を構造化されたオブジェクトとして取得
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * プロジェクト関連エラー
 */
export class ProjectError extends DialogoiError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'ProjectError';
    Object.setPrototypeOf(this, ProjectError.prototype);
  }
}

/**
 * プロジェクトが見つからない場合のエラー
 */
export class ProjectNotFoundError extends ProjectError {
  constructor(projectId: string, context?: Record<string, unknown>) {
    super(`プロジェクトが見つかりません: ${projectId}`, 'PROJECT_NOT_FOUND', {
      projectId,
      ...context,
    });
    this.name = 'ProjectNotFoundError';
    Object.setPrototypeOf(this, ProjectNotFoundError.prototype);
  }
}

/**
 * プロジェクト設定が無効な場合のエラー
 */
export class InvalidProjectConfigError extends ProjectError {
  constructor(projectId: string, reason: string, context?: Record<string, unknown>) {
    super(`プロジェクト設定が無効です: ${projectId} - ${reason}`, 'INVALID_PROJECT_CONFIG', {
      projectId,
      reason,
      ...context,
    });
    this.name = 'InvalidProjectConfigError';
    Object.setPrototypeOf(this, InvalidProjectConfigError.prototype);
  }
}

/**
 * インデックス関連エラー
 */
export class IndexingError extends DialogoiError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'IndexingError';
    Object.setPrototypeOf(this, IndexingError.prototype);
  }
}

/**
 * インデックス構築失敗エラー
 */
export class IndexBuildError extends IndexingError {
  constructor(projectId: string, reason: string, context?: Record<string, unknown>) {
    super(`インデックス構築に失敗しました: ${projectId} - ${reason}`, 'INDEX_BUILD_FAILED', {
      projectId,
      reason,
      ...context,
    });
    this.name = 'IndexBuildError';
    Object.setPrototypeOf(this, IndexBuildError.prototype);
  }
}

/**
 * インデックス更新失敗エラー
 */
export class IndexUpdateError extends IndexingError {
  constructor(
    projectId: string,
    filePath: string,
    reason: string,
    context?: Record<string, unknown>,
  ) {
    super(
      `インデックス更新に失敗しました: ${projectId}/${filePath} - ${reason}`,
      'INDEX_UPDATE_FAILED',
      { projectId, filePath, reason, ...context },
    );
    this.name = 'IndexUpdateError';
    Object.setPrototypeOf(this, IndexUpdateError.prototype);
  }
}

/**
 * 検索関連エラー
 */
export class SearchError extends DialogoiError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'SearchError';
    Object.setPrototypeOf(this, SearchError.prototype);
  }
}

/**
 * 検索実行失敗エラー
 */
export class SearchExecutionError extends SearchError {
  constructor(query: string, reason: string, context?: Record<string, unknown>) {
    super(`検索の実行に失敗しました: "${query}" - ${reason}`, 'SEARCH_EXECUTION_FAILED', {
      query,
      reason,
      ...context,
    });
    this.name = 'SearchExecutionError';
    Object.setPrototypeOf(this, SearchExecutionError.prototype);
  }
}

/**
 * 無効な検索クエリエラー
 */
export class InvalidSearchQueryError extends SearchError {
  constructor(query: string, reason: string, context?: Record<string, unknown>) {
    super(`無効な検索クエリです: "${query}" - ${reason}`, 'INVALID_SEARCH_QUERY', {
      query,
      reason,
      ...context,
    });
    this.name = 'InvalidSearchQueryError';
    Object.setPrototypeOf(this, InvalidSearchQueryError.prototype);
  }
}

/**
 * 検索バックエンド利用不可エラー
 */
export class SearchBackendUnavailableError extends SearchError {
  constructor(query: string, reason: string, context?: Record<string, unknown>) {
    super(
      `検索バックエンドが利用できません: "${query}" - ${reason}`,
      'SEARCH_BACKEND_UNAVAILABLE',
      {
        query,
        reason,
        ...context,
      },
    );
    this.name = 'SearchBackendUnavailableError';
    Object.setPrototypeOf(this, SearchBackendUnavailableError.prototype);
  }
}

/**
 * ファイル関連エラー
 */
export class FileError extends DialogoiError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'FileError';
    Object.setPrototypeOf(this, FileError.prototype);
  }
}

/**
 * ファイル読み込み失敗エラー
 */
export class FileReadError extends FileError {
  constructor(filePath: string, reason: string, context?: Record<string, unknown>) {
    super(`ファイル読み込みに失敗しました: ${filePath} - ${reason}`, 'FILE_READ_FAILED', {
      filePath,
      reason,
      ...context,
    });
    this.name = 'FileReadError';
    Object.setPrototypeOf(this, FileReadError.prototype);
  }
}

/**
 * ファイル書き込み失敗エラー
 */
export class FileWriteError extends FileError {
  constructor(filePath: string, reason: string, context?: Record<string, unknown>) {
    super(`ファイル書き込みに失敗しました: ${filePath} - ${reason}`, 'FILE_WRITE_FAILED', {
      filePath,
      reason,
      ...context,
    });
    this.name = 'FileWriteError';
    Object.setPrototypeOf(this, FileWriteError.prototype);
  }
}

/**
 * 設定関連エラー
 */
export class ConfigurationError extends DialogoiError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * 設定読み込み失敗エラー
 */
export class ConfigLoadError extends ConfigurationError {
  constructor(configPath: string, reason: string, context?: Record<string, unknown>) {
    super(`設定ファイルの読み込みに失敗しました: ${configPath} - ${reason}`, 'CONFIG_LOAD_FAILED', {
      configPath,
      reason,
      ...context,
    });
    this.name = 'ConfigLoadError';
    Object.setPrototypeOf(this, ConfigLoadError.prototype);
  }
}
