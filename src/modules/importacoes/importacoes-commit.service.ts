/**
 * Nascentes do Cariri — Serviço de Persistência Transacional, Deduplicação e Rollback
 *
 * Responsável por efetivar a confirmação de uma importação validada no MySQL:
 * 1. Valida entrada em runtime e estado elegível da Importacao;
 * 2. Recupera o arquivo TXT original do storage privado e valida integridade SHA-256;
 * 3. Adquire trava atômica de concorrência dentro da transação (AGUARDANDO_CONFIRMACAO -> PROCESSANDO);
 * 4. Recheca duplicidades existentes na base pela chave canônica [latitude, longitude, fonte];
 * 5. Insere cumulativamente apenas os registros novos vinculados ao importacaoId, sem excluir dados prévios;
 * 6. Consolida status CONCLUIDA, contadores finais e concluidaAt;
 * 7. Em qualquer falha, executa rollback integral mantendo base e arquivos originais intactos;
 * 8. Somente após commit bem-sucedido no banco, invalida o cache público de nascentes.
 */

import type { PrismaClient } from '@prisma/client';
import { StatusImportacao } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { verifyFileIntegrity } from '@/lib/storage';
import { onImportacaoConcluida } from '@/modules/nascentes/nascentes.cache';
import { importacaoStorageService as defaultImportacaoStorageService } from './importacoes-storage.service';
import {
  buildNascenteDuplicateKey,
  decodeTxtContent,
  parseNascentesTxt,
} from './txt-parser';
import {
  CONFIRMABLE_IMPORTACAO_STATUS,
  IMPORTACAO_COMMIT_ERROR_CODES,
  confirmImportacaoInputSchema,
  type ConfirmImportacaoInput,
  type ConfirmImportacaoOptions,
  type IImportacaoCommitService,
  type IImportacaoStorageService,
  type ImportacaoCommitServiceDeps,
  type ImportacaoConfirmResponseDto,
  type OnCommitCacheInvalidator,
  type PrismaTransactionClient,
  type TxtParseResult,
  type ValidTxtRow,
} from './importacoes.types';

const TRANSACTION_OPTIONS = {
  maxWait: 5000,
  timeout: 30000,
} as const;

interface TransactionCommitOutcome {
  readonly importacaoId: number;
  readonly nomeArquivo: string;
  readonly hashArquivo: string;
  readonly totalLinhas: number;
  readonly totalInseridas: number;
  readonly totalDuplicadas: number;
  readonly concluidaAt: Date;
}

export class ImportacaoCommitService implements IImportacaoCommitService {
  private readonly prisma: PrismaClient;
  private readonly storageService: IImportacaoStorageService;
  private readonly cacheInvalidator: OnCommitCacheInvalidator;

  constructor(deps?: ImportacaoCommitServiceDeps) {
    this.prisma = deps?.prismaClient ?? defaultPrisma;
    this.storageService = deps?.storageService ?? defaultImportacaoStorageService;
    this.cacheInvalidator = deps?.cacheInvalidator ?? onImportacaoConcluida;
  }

  /**
   * Executa a confirmação atômica de uma importação validada.
   */
  async confirmImportacao(
    input: ConfirmImportacaoInput,
    options?: ConfirmImportacaoOptions
  ): Promise<ImportacaoConfirmResponseDto> {
    const parsedInput = confirmImportacaoInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new AppError(
        parsedInput.error.issues[0]?.message ?? 'Parâmetros inválidos para confirmar importação.',
        400,
        IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
      );
    }

    const { importacaoId, usuarioId } = parsedInput.data;

    // 1. Verificação inicial de existência e estado elegível
    const importacao = await this.prisma.importacao.findUnique({
      where: { id: importacaoId },
    });

    if (!importacao) {
      throw new AppError(
        `Importação com ID ${importacaoId} não foi encontrada.`,
        404,
        IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_NOT_FOUND
      );
    }

    this.assertConfirmableState(importacao.status, importacao.totalInvalidas, importacao.id);

    // 2. Recuperação e validação criptográfica + sintática do TXT original no storage privado
    const parseResult = await this.loadAndVerifyOriginalTxt(
      {
        id: importacao.id,
        caminhoPrivadoArquivo: importacao.caminhoPrivadoArquivo,
        hashArquivo: importacao.hashArquivo,
      },
      options
    );

    // 3. Execução transacional "tudo-ou-nada" no MySQL
    const committed = await this.executeAtomicCommit(
      {
        importacaoId: importacao.id,
        nomeArquivo: importacao.nomeArquivo,
        hashArquivo: importacao.hashArquivo,
        parseResult,
      },
      options
    );

    // 4. Invalidação do cache público somente após o commit bem-sucedido
    const activeInvalidator = options?.onCacheInvalidate ?? this.cacheInvalidator;
    activeInvalidator(committed.importacaoId);

    logger.info('Importação confirmada e persistida atomicamente.', {
      importacaoId: committed.importacaoId,
      usuarioId: usuarioId ?? importacao.usuarioId,
      totalLinhas: committed.totalLinhas,
      totalInseridas: committed.totalInseridas,
      totalDuplicadas: committed.totalDuplicadas,
      cacheInvalidated: true,
    });

    return {
      importacaoId: committed.importacaoId,
      nomeArquivo: committed.nomeArquivo,
      hashSha256: committed.hashArquivo,
      status: StatusImportacao.CONCLUIDA,
      summary: {
        totalLinhas: committed.totalLinhas,
        totalInseridas: committed.totalInseridas,
        totalDuplicadas: committed.totalDuplicadas,
        totalInvalidas: 0,
      },
      cacheInvalidated: true,
      concluidaAt: committed.concluidaAt.toISOString(),
    };
  }

  /**
   * Garante que a importação esteja estritamente elegível para confirmação.
   */
  private assertConfirmableState(
    status: StatusImportacao,
    totalInvalidas: number,
    importacaoId: number
  ): void {
    if (
      status === StatusImportacao.CONCLUIDA ||
      status === StatusImportacao.PROCESSANDO
    ) {
      throw new AppError(
        `A importação ${importacaoId} já está em estado '${status}' e não pode ser confirmada novamente.`,
        409,
        IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED
      );
    }

    if (status !== CONFIRMABLE_IMPORTACAO_STATUS || totalInvalidas > 0) {
      throw new AppError(
        `A importação ${importacaoId} não está apta para confirmação (status: ${status}, inválidas: ${totalInvalidas}).`,
        409,
        IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_STATE
      );
    }
  }

  /**
   * Recupera o TXT original do storage privado, confere o SHA-256 e reexecuta o parser.
   */
  private async loadAndVerifyOriginalTxt(
    importacao: {
      readonly id: number;
      readonly caminhoPrivadoArquivo: string;
      readonly hashArquivo: string;
    },
    options?: ConfirmImportacaoOptions
  ): Promise<TxtParseResult> {
    let rawBuffer: Buffer;
    try {
      rawBuffer = await this.storageService.retrieveOriginalFile(
        importacao.caminhoPrivadoArquivo,
        { storageDriver: options?.storageDriver }
      );
    } catch (error: unknown) {
      logger.error('Falha ao recuperar arquivo TXT original no storage privado.', error, {
        importacaoId: importacao.id,
      });

      throw new AppError(
        'Não foi possível recuperar o arquivo TXT original para confirmar a importação.',
        422,
        IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR
      );
    }

    const integrity = verifyFileIntegrity(rawBuffer, importacao.hashArquivo);
    if (!integrity.valid) {
      throw new AppError(
        'A integridade do arquivo TXT original não confere com o hash SHA-256 registrado.',
        422,
        IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR
      );
    }

    let textContent: string;
    try {
      textContent = decodeTxtContent(rawBuffer);
    } catch {
      throw new AppError(
        'O arquivo TXT armazenado não possui codificação UTF-8 válida.',
        422,
        IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_CONTENT
      );
    }

    const parseResult = parseNascentesTxt(textContent);
    if (!parseResult.headerValid || parseResult.allErrors.length > 0) {
      throw new AppError(
        'O conteúdo do arquivo TXT contém inconsistências que impedem a persistência.',
        422,
        IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_CONTENT
      );
    }

    return parseResult;
  }

  /**
   * Executa a transação atômica no Prisma garantindo trava de concorrência,
   * deduplicação atualizada e rollback automático em qualquer falha.
   */
  private async executeAtomicCommit(
    params: {
      readonly importacaoId: number;
      readonly nomeArquivo: string;
      readonly hashArquivo: string;
      readonly parseResult: TxtParseResult;
    },
    options?: ConfirmImportacaoOptions
  ): Promise<TransactionCommitOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Trava atômica compare-and-swap via lock de linha no InnoDB
        const claimed = await tx.importacao.updateMany({
          where: {
            id: params.importacaoId,
            status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
          },
          data: {
            status: StatusImportacao.PROCESSANDO,
          },
        });

        if (claimed.count === 0) {
          throw new AppError(
            `A importação ${params.importacaoId} já foi processada ou reivindicada concorrentemente.`,
            409,
            IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED
          );
        }

        // Carrega todas as chaves únicas existentes dentro da transação
        const existingKeys = await this.loadAllDuplicateKeysInTransaction(tx);

        const rowsToInsert: ValidTxtRow[] = [];
        let dbDuplicatesCount = 0;

        for (const row of params.parseResult.validRows) {
          if (existingKeys.has(row.duplicateKey)) {
            dbDuplicatesCount += 1;
            continue;
          }

          existingKeys.add(row.duplicateKey);
          rowsToInsert.push(row);
        }

        const totalDuplicadas =
          params.parseResult.summary.totalDuplicadas + dbDuplicatesCount;

        // Inserção cumulativa vinculada ao importacaoId, preservando todos os registros prévios
        let insertedCount = 0;
        for (const row of rowsToInsert) {
          await tx.nascente.create({
            data: {
              importacaoId: params.importacaoId,
              latitude: row.data.latitude,
              longitude: row.data.longitude,
              municipio: row.data.municipio,
              fonte: row.data.fonte,
              localidade: row.data.localidade,
              dataCriacao: row.data.dataCriacao,
              vazaoMedia: row.data.vazaoMedia,
              ativo: true,
            },
          });

          insertedCount += 1;

          if (options?.onAfterRowInsert) {
            await options.onAfterRowInsert({
              tx,
              importacaoId: params.importacaoId,
              insertedCount,
              totalToInsert: rowsToInsert.length,
            });
          }
        }

        const concluidaAt = new Date();

        await tx.importacao.update({
          where: { id: params.importacaoId },
          data: {
            status: StatusImportacao.CONCLUIDA,
            concluidaAt,
            totalLinhas: params.parseResult.summary.totalLinhas,
            totalValidas: insertedCount,
            totalInvalidas: 0,
            totalDuplicadas,
            mensagemErro: null,
          },
        });

        return {
          importacaoId: params.importacaoId,
          nomeArquivo: params.nomeArquivo,
          hashArquivo: params.hashArquivo,
          totalLinhas: params.parseResult.summary.totalLinhas,
          totalInseridas: insertedCount,
          totalDuplicadas,
          concluidaAt,
        };
      }, TRANSACTION_OPTIONS);
    } catch (error: unknown) {
      logger.error(
        'Transação de confirmação abortada; rollback executado preservando base e arquivos prévios.',
        error,
        {
          importacaoId: params.importacaoId,
        }
      );

      throw error;
    }
  }

  /**
   * Consulta todas as chaves de unicidade [latitude, longitude, fonte] dentro da transação ativa
   * para alinhamento fiel ao índice UNIQUE chave_duplicidade_nascente do MySQL.
   */
  private async loadAllDuplicateKeysInTransaction(
    tx: PrismaTransactionClient
  ): Promise<Set<string>> {
    const existingRows = await tx.nascente.findMany({
      select: {
        latitude: true,
        longitude: true,
        fonte: true,
      },
    });

    const keys = new Set<string>();
    for (const row of existingRows) {
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
}

/**
 * Instância Singleton padrão do serviço para uso no backend da aplicação.
 */
export const importacaoCommitService = new ImportacaoCommitService();
