// ロギング関連のエクスポート
export type { Logger, LogEntry, LogAppender } from './Logger.js';

export { LogLevel, DefaultLogger, ConsoleAppender, FileAppender, LoggerFactory } from './Logger.js';

// 便利な関数をエクスポート
import { LoggerFactory, type Logger } from './Logger.js';
export const getLogger = (): Logger => LoggerFactory.getLogger();
