import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/integration/**/*.test.ts'],
    testTimeout: 20000, // 統合テストのタイムアウト
    hookTimeout: 25000, // beforeEach/afterEachフックのタイムアウト（サーバークリーンアップの10秒タイムアウト + さらに余裕を持たせる）
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/'],
    },
  },
});
