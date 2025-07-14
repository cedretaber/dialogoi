import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileWatcher, createDefaultFileWatcherConfig } from './fileWatcher.js';
import path from 'path';

describe('FileWatcher', () => {
  let fileWatcher: FileWatcher;
  const testProjectRoot = path.join(process.cwd(), 'test-project');

  beforeEach(() => {
    const config = createDefaultFileWatcherConfig(testProjectRoot);
    config.debounceMs = 50; // テスト用に短縮
    fileWatcher = new FileWatcher(config);
  });

  afterEach(async () => {
    if (fileWatcher) {
      await fileWatcher.stop();
    }
  });

  describe('設定', () => {
    it('デフォルト設定を作成できる', () => {
      const config = createDefaultFileWatcherConfig('/test/path');
      expect(config.projectRoot).toBe('/test/path');
      expect(config.watchedExtensions).toEqual(['md', 'txt']);
      expect(config.debounceMs).toBe(500);
      expect(config.ignorePatterns).toContain('**/node_modules/**');
      expect(config.ignorePatterns).toContain('**/.git/**');
    });
  });

  describe('ファイル監視の開始・停止', () => {
    it('監視を開始できる', async () => {
      expect(fileWatcher.getWatchingStatus()).toBe(false);

      const readyPromise = new Promise<void>((resolve) => {
        fileWatcher.once('ready', resolve);
      });

      await fileWatcher.start();
      await readyPromise;

      expect(fileWatcher.getWatchingStatus()).toBe(true);
    });

    it('監視を停止できる', async () => {
      const readyPromise = new Promise<void>((resolve) => {
        fileWatcher.once('ready', resolve);
      });

      await fileWatcher.start();
      await readyPromise;

      expect(fileWatcher.getWatchingStatus()).toBe(true);

      await fileWatcher.stop();
      expect(fileWatcher.getWatchingStatus()).toBe(false);
    });

    it('既に開始されている場合は警告を出す', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const readyPromise = new Promise<void>((resolve) => {
        fileWatcher.once('ready', resolve);
      });

      await fileWatcher.start();
      await readyPromise;

      // 2回目の開始
      await fileWatcher.start();

      expect(consoleSpy).toHaveBeenCalledWith('⚠️  ファイル監視は既に開始されています');
      consoleSpy.mockRestore();
    });
  });

  describe('小説IDの抽出', () => {
    it('正しいファイルパスから小説IDを抽出できる', () => {
      const config = createDefaultFileWatcherConfig('/novels');
      const watcher = new FileWatcher(config);

      // private method をテストするため、型アサーション
      const extractNovelId = (
        watcher as unknown as { extractNovelId: (path: string) => string | null }
      ).extractNovelId.bind(watcher);

      expect(extractNovelId('/novels/sample_novel/settings/basic.md')).toBe('sample_novel');
      expect(extractNovelId('/novels/mystery_story/contents/chapter1.txt')).toBe('mystery_story');
      expect(extractNovelId('/novels/.hidden/file.md')).toBe(null);
      expect(extractNovelId('/other/path/file.md')).toBe(null);
    });
  });

  describe('イベントタイプの表示', () => {
    it('正しい表示名を返す', () => {
      const config = createDefaultFileWatcherConfig('/novels');
      const watcher = new FileWatcher(config);

      // private method をテストするため、型アサーション
      const getEventTypeDisplay = (
        watcher as unknown as { getEventTypeDisplay: (type: string) => string }
      ).getEventTypeDisplay.bind(watcher);

      expect(getEventTypeDisplay('add')).toBe('追加');
      expect(getEventTypeDisplay('change')).toBe('変更');
      expect(getEventTypeDisplay('unlink')).toBe('削除');
      expect(getEventTypeDisplay('unknown')).toBe('変更');
    });
  });

  describe('設定の検証', () => {
    it('監視対象の拡張子が設定されている', () => {
      const config = createDefaultFileWatcherConfig('/test');
      expect(config.watchedExtensions).toContain('md');
      expect(config.watchedExtensions).toContain('txt');
    });

    it('適切な無視パターンが設定されている', () => {
      const config = createDefaultFileWatcherConfig('/test');
      expect(config.ignorePatterns).toContain('**/node_modules/**');
      expect(config.ignorePatterns).toContain('**/.git/**');
      expect(config.ignorePatterns).toContain('**/.DS_Store');
      expect(config.ignorePatterns).toContain('**/.*');
      expect(config.ignorePatterns).toContain('**/.*/***');
    });
  });
});
