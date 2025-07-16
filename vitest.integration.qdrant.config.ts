import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/integration-qdrant/**/*.test.ts'],
    testTimeout: 30000, // Qdrant統合テストのタイムアウト
    hookTimeout: 35000, // beforeEach/afterEachフックのタイムアウト
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/'],
    },
  },
});
