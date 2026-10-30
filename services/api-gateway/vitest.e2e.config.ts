import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// End-to-end tests run the real gateway against small local stand-ins for the services.
export default defineConfig({
  test: {
    include: ['test/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
