/*
  Warnings:

  - A unique constraint covering the columns `[latitude,longitude,fonte]` on the table `nascentes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX `nascentes_ativo_idx` ON `nascentes`(`ativo`);

-- CreateIndex
CREATE INDEX `nascentes_municipio_idx` ON `nascentes`(`municipio`);

-- CreateIndex
CREATE INDEX `nascentes_latitude_longitude_idx` ON `nascentes`(`latitude`, `longitude`);

-- CreateIndex
CREATE UNIQUE INDEX `nascentes_latitude_longitude_fonte_key` ON `nascentes`(`latitude`, `longitude`, `fonte`);

-- RenameIndex
ALTER TABLE `nascentes` RENAME INDEX `nascentes_importacao_id_fkey` TO `nascentes_importacao_id_idx`;
