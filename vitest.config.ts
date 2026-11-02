import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/server/test/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@creator-center/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
