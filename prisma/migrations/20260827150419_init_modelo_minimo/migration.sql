-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `importacoes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `nome_arquivo` VARCHAR(255) NOT NULL,
    `caminho_privado_arquivo` VARCHAR(512) NOT NULL,
    `hash_arquivo` VARCHAR(64) NOT NULL,
    `total_linhas` INTEGER NOT NULL DEFAULT 0,
    `total_validas` INTEGER NOT NULL DEFAULT 0,
    `total_invalidas` INTEGER NOT NULL DEFAULT 0,
    `total_duplicadas` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('VALIDANDO', 'AGUARDANDO_CONFIRMACAO', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU') NOT NULL DEFAULT 'VALIDANDO',
    `mensagem_erro` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `concluida_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nascentes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `latitude` DECIMAL(10, 8) NOT NULL,
    `longitude` DECIMAL(11, 8) NOT NULL,
    `municipio` VARCHAR(150) NOT NULL,
    `fonte` VARCHAR(255) NOT NULL,
    `localidade` VARCHAR(255) NOT NULL,
    `data_criacao` DATE NOT NULL,
    `vazao_media` DECIMAL(10, 3) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `importacao_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `importacoes` ADD CONSTRAINT `importacoes_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nascentes` ADD CONSTRAINT `nascentes_importacao_id_fkey` FOREIGN KEY (`importacao_id`) REFERENCES `importacoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
