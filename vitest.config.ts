import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    fileParallelism: false,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
