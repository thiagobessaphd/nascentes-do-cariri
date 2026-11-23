-- CreateTable
CREATE TABLE `sessoes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessoes_token_hash_key`(`token_hash`),
    INDEX `sessoes_usuario_id_revoked_at_expires_at_idx`(`usuario_id`, `revoked_at`, `expires_at`),
    INDEX `sessoes_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tentativas_login` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `chave_hash` CHAR(64) NOT NULL,
    `tentativas` INTEGER NOT NULL DEFAULT 0,
    `janela_inicio` DATETIME(3) NOT NULL,
    `bloqueado_ate` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tentativas_login_chave_hash_key`(`chave_hash`),
    INDEX `tentativas_login_janela_inicio_bloqueado_ate_idx`(`janela_inicio`, `bloqueado_ate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessoes` ADD CONSTRAINT `sessoes_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
