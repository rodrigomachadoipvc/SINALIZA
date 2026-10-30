import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  // SWC emits the decorator metadata NestJS needs for dependency injection.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
