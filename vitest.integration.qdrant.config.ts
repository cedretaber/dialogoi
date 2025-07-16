import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/integration-qdrant/**/*.test.ts'],
    testTimeout: 60000, // Qdrant統合テストのタイムアウト
    hookTimeout: 65000, // beforeEach/afterEachフックのタイムアウト
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/'],
    },
  },
});
