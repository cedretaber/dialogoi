// ロギング関連のエクスポート
export {
  LogLevel,
  Logger,
  LogEntry,
  LogAppender,
  DefaultLogger,
  ConsoleAppender,
  FileAppender,
  LoggerFactory,
} from './Logger';

// 便利な関数をエクスポート
import { LoggerFactory, Logger } from './Logger';
export const getLogger = (): Logger => LoggerFactory.getLogger();
