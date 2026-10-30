import { defineConfig } from 'vitest/config';

// Runs against the live stack (docker compose), so tests run one after the other.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
