/*
  Warnings:

  - A unique constraint covering the columns `[caminho_privado_arquivo]` on the table `importacoes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `importacoes_caminho_privado_arquivo_key` ON `importacoes`(`caminho_privado_arquivo`);

-- CreateIndex
CREATE INDEX `importacoes_hash_arquivo_idx` ON `importacoes`(`hash_arquivo`);

-- CreateIndex
CREATE INDEX `importacoes_usuario_id_idx` ON `importacoes`(`usuario_id`);

-- CreateIndex
CREATE INDEX `importacoes_status_created_at_idx` ON `importacoes`(`status`, `created_at`);

