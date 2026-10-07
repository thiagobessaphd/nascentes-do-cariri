import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Desabilita paralelismo entre arquivos para evitar condições de corrida nos testes de integração com o MySQL
    fileParallelism: false,
  },
});
