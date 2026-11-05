/**
 * Nascentes do Cariri — Serviço de Validação e Prévia de Importações
 *
 * Conecta o validador preliminar fail-fast, o armazenamento privado auditável
 * com hash SHA-256 e o motor de parsing e validação linha a linha, produzindo
 * o diagnóstico consolidado e seguro para o administrador sem vazar caminhos privados.
 */

import type { PrismaClient } from '@prisma/client';
import { StatusImportacao } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import {
  importacaoStorageService as defaultImportacaoStorageService,
} from './importacoes-storage.service';
import { validatePreliminaryUpload } from './file-validator';
import { buildNascenteDuplicateKey, parseNascentesTxt } from './txt-parser';
import type {
  IImportacaoStorageService,
  IImportacaoValidationService,
  ImportacaoValidationResponseDto,
  ValidateAndPreviewImportacaoInput,
  ValidateAndPreviewOptions,
} from './importacoes.types';

export class ImportacaoValidationService implements IImportacaoValidationService {
  private readonly prisma: PrismaClient;
  private readonly storageService: IImportacaoStorageService;

  constructor(options?: {
    readonly prismaClient?: PrismaClient | undefined;
    readonly storageService?: IImportacaoStorageService | undefined;
  }) {
    this.prisma = options?.prismaClient ?? defaultPrisma;
    this.storageService = options?.storageService ?? defaultImportacaoStorageService;
  }

  /**
   * Carrega as chaves normalizadas de duplicidade das nascentes ativas existentes no MySQL.
   *
   * Utiliza projeção mínima indexada (latitude, longitude, fonte) para máxima eficiência
   * e baixo consumo de memória no processo.
   */
  async loadExistingDuplicateKeys(): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.nascente.findMany({
      where: { ativo: true },
      select: {
        latitude: true,
        longitude: true,
        fonte: true,
      },
    });

    const keys = new Set<string>();
    for (const row of rows) {
      keys.add(
        buildNascenteDuplicateKey(
          Number(row.latitude),
          Number(row.longitude),
          row.fonte
        )
      );
    }

    return keys;
  }

  /**
   * Executa o pipeline orquestrado de validação e prévia:
   * 1. Validações preliminares estritas (contagem=1, .txt, tamanho, binário, vazio, UTF-8);
   * 2. Persistência privada no storage e criação do registro inicial da Importacao (status VALIDANDO);
   * 3. Busca das chaves existentes de duplicidade no MySQL;
   * 4. Parsing e validação de negócio linha a linha (com regras de Cariri, datas, vazão e duplicatas);
   * 5. Transição de estado no MySQL:
   *    - Se canConfirm === true: status AGUARDANDO_CONFIRMACAO
   *    - Se canConfirm === false: status FALHOU (preservando o arquivo original no storage para auditoria)
   * 6. Retorno do DTO administrativo seguro.
   */
  async validateAndPreview(
    input: ValidateAndPreviewImportacaoInput,
    options?: ValidateAndPreviewOptions
  ): Promise<ImportacaoValidationResponseDto> {
    // 1. Validações preliminares
    const preliminary = validatePreliminaryUpload(input.files, {
      maxSizeBytes: options?.maxSizeBytes,
    });

    // 2. Armazena arquivo no storage privado e registra entidade Importacao com status VALIDANDO
    const storedFile = await this.storageService.storeOriginalFile(
      {
        filename: preliminary.filename,
        content: preliminary.buffer,
        usuarioId: input.usuarioId,
      },
      {
        maxSizeBytes: options?.maxSizeBytes,
        storageDriver: options?.storageDriver,
      }
    );

    try {
      // 3. Consulta de chaves ativas existentes para deduplicação cruzada com o banco
      const existingKeys = await this.loadExistingDuplicateKeys();

      // 4. Executa o parser e validador linha a linha
      const parseResult = parseNascentesTxt(preliminary.textContent, {
        existingKeys,
      });

      // 5. Determina a transição da máquina de estados do MySQL
      const targetStatus = parseResult.canConfirm
        ? StatusImportacao.AGUARDANDO_CONFIRMACAO
        : StatusImportacao.FALHOU;

      const mensagemErro = parseResult.canConfirm
        ? null
        : parseResult.allErrors.length > 0
          ? `Arquivo rejeitado com ${parseResult.allErrors.length} inconsistência(s) de validação.`
          : 'Arquivo sem registros válidos para confirmação.';

      // Atualiza os contadores e o status da importação no MySQL
      const updatedImportacao = await this.prisma.importacao.update({
        where: { id: storedFile.importacaoId },
        data: {
          status: targetStatus,
          totalLinhas: parseResult.summary.totalLinhas,
          totalValidas: parseResult.summary.totalValidas,
          totalInvalidas: parseResult.summary.totalInvalidas,
          totalDuplicadas: parseResult.summary.totalDuplicadas,
          mensagemErro,
        },
      });

      logger.info('Validação de importação concluída.', {
        importacaoId: updatedImportacao.id,
        status: updatedImportacao.status,
        totalValidas: updatedImportacao.totalValidas,
        totalInvalidas: updatedImportacao.totalInvalidas,
        totalDuplicadas: updatedImportacao.totalDuplicadas,
        canConfirm: parseResult.canConfirm,
      });

      // 6. Retorna o DTO seguro para o administrador
      return {
        importacaoId: updatedImportacao.id,
        nomeArquivo: updatedImportacao.nomeArquivo,
        hashSha256: updatedImportacao.hashArquivo,
        tamanhoBytes: storedFile.tamanhoBytes,
        status: updatedImportacao.status,
        canConfirm: parseResult.canConfirm,
        summary: parseResult.summary,
        validRows: parseResult.validRows,
        duplicateRows: parseResult.duplicateRows,
        invalidRows: parseResult.invalidRows,
        allErrors: parseResult.allErrors,
        createdAt: updatedImportacao.createdAt.toISOString(),
      };
    } catch (error) {
      // Se ocorrer um erro inesperado após o armazenamento, marca a importação como FALHOU para manter auditoria
      await this.prisma.importacao
        .update({
          where: { id: storedFile.importacaoId },
          data: {
            status: StatusImportacao.FALHOU,
            mensagemErro:
              error instanceof Error ? error.message : 'Erro interno durante processamento.',
          },
        })
        .catch((updateError: unknown) => {
          logger.warn('Falha ao atualizar status de importação após erro interno.', {
            importacaoId: storedFile.importacaoId,
            error: updateError instanceof Error ? updateError.message : String(updateError),
          });
        });

      throw error;
    }
  }
}

export const importacaoValidationService = new ImportacaoValidationService();