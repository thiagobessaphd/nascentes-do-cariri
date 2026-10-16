import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Desabilita paralelismo entre arquivos para evitar condições de corrida nos testes de integração com o MySQL
    fileParallelism: false,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});