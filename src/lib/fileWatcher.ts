import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * ファイル変更イベントの種類
 */
export type FileEvent = 'add' | 'change' | 'unlink';

/**
 * ファイル変更イベントのデータ
 */
export interface FileChangeEvent {
  type: FileEvent;
  filePath: string;
  novelId: string;
}

/**
 * ファイル監視の設定
 */
export interface FileWatcherConfig {
  projectRoot: string;
  watchedExtensions: string[];
  debounceMs: number;
  ignorePatterns: string[];
}

/**
 * ファイル監視クラス
 * chokidarを使用してファイルシステムの変更を監視し、
 * デバウンス処理を行ってイベントを発行する
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private config: FileWatcherConfig;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private isWatching = false;

  constructor(config: FileWatcherConfig) {
    super();
    this.config = config;
  }

  /**
   * ファイル監視を開始
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      console.error('⚠️  ファイル監視は既に開始されています');
      return;
    }

    console.error('👁️  ファイル監視を開始します');
    console.error(`📁 監視対象: ${this.config.projectRoot}`);
    console.error(`📄 対象拡張子: ${this.config.watchedExtensions.join(', ')}`);

    // ディレクトリ監視に戻す
    const watchPatterns = [this.config.projectRoot];

    console.error(`🔍 監視パターン: ${watchPatterns.join(', ')}`);
    console.error(`🚫 無視パターン: ${this.config.ignorePatterns.join(', ')}`);

    this.watcher = chokidar.watch(watchPatterns, {
      ignored: this.config.ignorePatterns,
      persistent: true,
      ignoreInitial: true, // 初回スキャンは無視
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('add', (filePath: string) => {
      console.error(`📝 ファイル追加検知: ${filePath}`);
      this.handleFileEvent('add', filePath);
    });

    this.watcher.on('change', (filePath: string) => {
      console.error(`📝 ファイル変更検知: ${filePath}`);
      this.handleFileEvent('change', filePath);
    });

    this.watcher.on('unlink', (filePath: string) => {
      console.error(`📝 ファイル削除検知: ${filePath}`);
      this.handleFileEvent('unlink', filePath);
    });

    this.watcher.on('error', (error: unknown) => {
      console.error('❌ ファイル監視エラー:', error);
      this.emit('error', error);
    });

    this.watcher.on('ready', () => {
      console.error('✅ ファイル監視の初期化が完了しました');
      const watched = this.watcher?.getWatched();
      if (watched) {
        const watchedFiles = Object.keys(watched).reduce((acc, dir) => {
          return acc + watched[dir].length;
        }, 0);
        console.error(`📊 監視中のファイル数: ${watchedFiles}`);
      }
      this.isWatching = true;
      this.emit('ready');
    });
  }

  /**
   * ファイル監視を停止
   */
  async stop(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    console.error('🛑 ファイル監視を停止します');

    // デバウンスタイマーをクリア
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isWatching = false;
    this.emit('stopped');
  }

  /**
   * 監視状態を取得
   */
  getWatchingStatus(): boolean {
    return this.isWatching;
  }

  /**
   * ファイル変更イベントを処理
   */
  private handleFileEvent(type: FileEvent, filePath: string): void {
    const absolutePath = path.resolve(filePath);

    // 拡張子チェック
    const ext = path.extname(absolutePath).slice(1);
    if (!this.config.watchedExtensions.includes(ext)) {
      return;
    }

    const novelId = this.extractNovelId(absolutePath);

    if (!novelId) {
      // 小説プロジェクト外のファイルは無視
      return;
    }

    const eventKey = `${type}:${absolutePath}`;

    // 既存のデバウンスタイマーをクリア
    const existingTimer = this.debounceTimers.get(eventKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // デバウンス処理
    const timer = setTimeout(() => {
      this.debounceTimers.delete(eventKey);

      const event: FileChangeEvent = {
        type,
        filePath: absolutePath,
        novelId,
      };

      console.error(
        `📝 ファイル${this.getEventTypeDisplay(type)}: ${path.relative(this.config.projectRoot, absolutePath)}`,
      );
      this.emit('fileChange', event);
    }, this.config.debounceMs);

    this.debounceTimers.set(eventKey, timer);
  }

  /**
   * ファイルパスから小説IDを抽出
   */
  private extractNovelId(filePath: string): string | null {
    const relativePath = path.relative(this.config.projectRoot, filePath);
    const pathParts = relativePath.split(path.sep);

    if (pathParts.length > 0 && !pathParts[0].startsWith('.')) {
      return pathParts[0];
    }

    return null;
  }

  /**
   * イベントタイプの表示名を取得
   */
  private getEventTypeDisplay(type: FileEvent): string {
    switch (type) {
      case 'add':
        return '追加';
      case 'change':
        return '変更';
      case 'unlink':
        return '削除';
      default:
        return '変更';
    }
  }
}

/**
 * デフォルトのファイル監視設定を作成
 */
export function createDefaultFileWatcherConfig(projectRoot: string): FileWatcherConfig {
  return {
    projectRoot: path.resolve(projectRoot), // 絶対パスに変換
    watchedExtensions: ['md', 'txt'],
    debounceMs: 500,
    ignorePatterns: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.tmp',
      '**/*.temp',
      '**/.*', // 隠しファイル
      '**/.*/***', // 隠しディレクトリ内のファイル
    ],
  };
}
