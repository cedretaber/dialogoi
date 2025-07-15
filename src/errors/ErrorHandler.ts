import { DialogoiError } from './DialogoiError.js';

/**
 * エラーハンドリングのユーティリティクラス
 */
export class ErrorHandler {
  /**
   * エラーが DialogoiError のインスタンスかどうかを判定
   */
  static isDialogoiError(error: unknown): error is DialogoiError {
    return error instanceof DialogoiError;
  }

  /**
   * unknown 型のエラーを DialogoiError に変換
   */
  static toDialogoiError(error: unknown, defaultCode = 'UNKNOWN_ERROR'): DialogoiError {
    if (ErrorHandler.isDialogoiError(error)) {
      return error;
    }

    if (error instanceof Error) {
      return new DialogoiError(error.message, defaultCode, {
        originalError: error.constructor.name,
        stack: error.stack,
      });
    }

    return new DialogoiError(String(error), defaultCode, { originalValue: error });
  }

  /**
   * エラーメッセージを安全に取得
   */
  static getMessage(error: unknown): string {
    if (ErrorHandler.isDialogoiError(error)) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  /**
   * エラーコードを安全に取得
   */
  static getCode(error: unknown): string {
    if (ErrorHandler.isDialogoiError(error)) {
      return error.code;
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * エラーのコンテキスト情報を安全に取得
   */
  static getContext(error: unknown): Record<string, unknown> {
    if (ErrorHandler.isDialogoiError(error)) {
      return error.context || {};
    }

    return {};
  }

  /**
   * エラーをログ出力用の構造化オブジェクトに変換
   */
  static toLogObject(error: unknown): Record<string, unknown> {
    if (ErrorHandler.isDialogoiError(error)) {
      return error.toJSON();
    }

    if (error instanceof Error) {
      return {
        name: error.constructor.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return {
      name: 'UnknownError',
      message: String(error),
      value: error,
    };
  }

  /**
   * 非同期処理のエラーを安全にキャッチして DialogoiError に変換
   */
  static async safeAsync<T>(
    operation: () => Promise<T>,
    errorCode: string,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const dialogoiError = ErrorHandler.toDialogoiError(error, errorCode);

      // コンテキスト情報を追加
      if (context) {
        Object.assign(dialogoiError.context || {}, context);
      }

      throw dialogoiError;
    }
  }

  /**
   * 同期処理のエラーを安全にキャッチして DialogoiError に変換
   */
  static safe<T>(operation: () => T, errorCode: string, context?: Record<string, unknown>): T {
    try {
      return operation();
    } catch (error) {
      const dialogoiError = ErrorHandler.toDialogoiError(error, errorCode);

      // コンテキスト情報を追加
      if (context) {
        Object.assign(dialogoiError.context || {}, context);
      }

      throw dialogoiError;
    }
  }
}
