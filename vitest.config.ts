import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/server/test/**/*.test.ts', 'apps/web/src/**/*.test.tsx'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@creator-center/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
});
