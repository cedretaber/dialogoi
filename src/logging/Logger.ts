/**
 * ログレベル定義
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * ログエントリの構造
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
  error?: Error;
}

/**
 * ログアペンダーのインターフェース
 */
export interface LogAppender {
  append(entry: LogEntry): void;
}

/**
 * ロガーのインターフェース
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
  addAppender(appender: LogAppender): void;
  removeAppender(appender: LogAppender): void;
}

/**
 * デフォルトロガー実装
 */
export class DefaultLogger implements Logger {
  private level: LogLevel = LogLevel.INFO;
  private appenders: LogAppender[] = [];

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
    // デフォルトでコンソールアペンダーを追加
    this.addAppender(new ConsoleAppender());
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  addAppender(appender: LogAppender): void {
    this.appenders.push(appender);
  }

  removeAppender(appender: LogAppender): void {
    const index = this.appenders.indexOf(appender);
    if (index >= 0) {
      this.appenders.splice(index, 1);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, undefined, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, undefined, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, undefined, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, error, meta);
  }

  private log(
    level: LogLevel,
    message: string,
    error?: Error,
    meta?: Record<string, unknown>,
  ): void {
    if (level <= this.level) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        meta,
        error,
      };

      this.appenders.forEach((appender) => {
        try {
          appender.append(entry);
        } catch (appendError) {
          // アペンダーのエラーは無視（無限ループを防ぐため）
          console.error('ログアペンダーでエラーが発生しました:', appendError);
        }
      });
    }
  }
}

/**
 * コンソール出力アペンダー
 */
export class ConsoleAppender implements LogAppender {
  append(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const prefix = `[${entry.timestamp}] ${levelName}:`;

    // MCP サーバーでは全てのログをstderrに出力する必要がある
    // stdoutはJSONメッセージ専用のため
    if (entry.error) {
      console.error(prefix, entry.message, entry.error, entry.meta);
    } else {
      console.error(prefix, entry.message, entry.meta);
    }
  }
}

/**
 * ファイル出力アペンダー（将来の拡張用）
 */
export class FileAppender implements LogAppender {
  constructor(private filePath: string) {}

  append(_entry: LogEntry): void {
    // 実装は将来の拡張時に追加
    // 現在は何もしない
  }
}

/**
 * グローバルロガーインスタンス
 */
let globalLogger: Logger = new DefaultLogger();

/**
 * ロガーファクトリー
 */
export class LoggerFactory {
  /**
   * グローバルロガーを設定
   */
  static setGlobalLogger(logger: Logger): void {
    globalLogger = logger;
  }

  /**
   * グローバルロガーを取得
   */
  static getLogger(): Logger {
    return globalLogger;
  }

  /**
   * 新しいロガーインスタンスを作成
   */
  static createLogger(level: LogLevel = LogLevel.INFO): Logger {
    return new DefaultLogger(level);
  }

  /**
   * 環境変数からログレベルを取得
   */
  static getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.DIALOGOI_LOG_LEVEL?.toUpperCase();

    switch (envLevel) {
      case 'ERROR':
        return LogLevel.ERROR;
      case 'WARN':
        return LogLevel.WARN;
      case 'INFO':
        return LogLevel.INFO;
      case 'DEBUG':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }
}
