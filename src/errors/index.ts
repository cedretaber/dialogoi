// エラークラスのエクスポート
export {
  DialogoiError,
  ProjectError,
  ProjectNotFoundError,
  InvalidProjectConfigError,
  IndexingError,
  IndexBuildError,
  IndexUpdateError,
  SearchError,
  SearchExecutionError,
  InvalidSearchQueryError,
  FileError,
  FileReadError,
  FileWriteError,
  ConfigurationError,
  ConfigLoadError,
} from './DialogoiError.js';

// エラーハンドリングユーティリティ関数
export { ErrorHandler } from './ErrorHandler.js';
