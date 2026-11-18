/**
 * Suíte de Testes Unitários do Cliente HTTP e Formatadores de Importação
 *
 * Valida:
 * 1. Formatação de vazão com unidade obrigatória 'm³/s';
 * 2. Formatação cartográfica de coordenadas e datas sem distorção de fuso;
 * 3. Formatação legível de tamanho de arquivo e rótulos de campos/erros;
 * 4. Paginação determinística O(1) para lotes grandes;
 * 5. Lógica de classificação do estado de prévia;
 * 6. Cliente HTTP uploadAndValidateTxt (sucesso, validações no cliente, tratamento de erros HTTP e rede).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cancelImportacaoById,
  canConfirmImportacao,
  clearPreviewSession,
  confirmImportacaoById,
  derivePreviewState,
  formatCoordinates,
  formatDuplicateReason,
  formatErrorCodeLabel,
  formatFieldLabel,
  formatFileSizeBytes,
  formatIsoDateToPtBr,
  formatVazaoMedia,
  IMPORTACAO_PREVIEW_STORAGE_KEY,
  ImportacaoClientError,
  loadPreviewSession,
  paginateSlice,
  savePreviewSession,
  uploadAndValidateTxt,
} from '@/services/importacoes.client';
import type {
  ImportacaoCancelResponseDto,
  ImportacaoConfirmResponseDto,
  ImportacaoValidationResponseDto,
} from '@/modules/importacoes/importacoes.types';

describe('Formatadores e Lógica Pura de Prévia (src/services/importacoes.client.ts)', () => {
  describe('formatVazaoMedia', () => {
    it('deve formatar valores numéricos com 2 a 3 casas decimais e unidade obrigatória m³/s', () => {
      expect(formatVazaoMedia(12.5)).toBe('12,50 m³/s');
      expect(formatVazaoMedia(0.876)).toBe('0,876 m³/s');
      expect(formatVazaoMedia(0.1234)).toBe('0,123 m³/s');
      expect(formatVazaoMedia(0)).toBe('0,00 m³/s');
      expect(formatVazaoMedia(1500)).toBe('1.500,00 m³/s');
    });

    it('deve retornar 0,00 m³/s para valores não numéricos, nulos ou indefinidos', () => {
      expect(formatVazaoMedia(null)).toBe('0,00 m³/s');
      expect(formatVazaoMedia(undefined)).toBe('0,00 m³/s');
      expect(formatVazaoMedia(Number.NaN)).toBe('0,00 m³/s');
      expect(formatVazaoMedia(Number.POSITIVE_INFINITY)).toBe('0,00 m³/s');
    });
  });

  describe('formatCoordinates', () => {
    it('deve formatar latitude e longitude cartográficas com 6 casas decimais', () => {
      expect(formatCoordinates(-7.2345678, -39.4123456)).toBe('-7.234568, -39.412346');
      expect(formatCoordinates(-7.2, -39.3)).toBe('-7.200000, -39.300000');
    });

    it('deve retornar mensagem amigável caso as coordenadas sejam inválidas', () => {
      expect(formatCoordinates(Number.NaN, -39.3)).toBe('Coordenadas inválidas');
      expect(formatCoordinates(-7.2, Number.POSITIVE_INFINITY)).toBe('Coordenadas inválidas');
    });
  });

  describe('formatIsoDateToPtBr (Data Civil sem deslocamento UTC)', () => {
    it('deve converter AAAA-MM-DD para DD/MM/AAAA imune a fuso horário', () => {
      expect(formatIsoDateToPtBr('2024-01-15')).toBe('15/01/2024');
      expect(formatIsoDateToPtBr('2026-08-01')).toBe('01/08/2026');
    });

    it('deve retornar fallback gracioso para entradas vazias ou em formatos não canônicos', () => {
      expect(formatIsoDateToPtBr(null)).toBe('Data não informada');
      expect(formatIsoDateToPtBr(undefined)).toBe('Data não informada');
      expect(formatIsoDateToPtBr('')).toBe('Data não informada');
      expect(formatIsoDateToPtBr('15/01/2024')).toBe('15/01/2024');
    });
  });

  describe('formatFileSizeBytes', () => {
    it('deve formatar bytes em B, KB e MB adequadamente', () => {
      expect(formatFileSizeBytes(0)).toBe('0 B');
      expect(formatFileSizeBytes(500)).toBe('500 B');
      expect(formatFileSizeBytes(1024)).toBe('1,0 KB');
      expect(formatFileSizeBytes(1536)).toBe('1,5 KB');
      expect(formatFileSizeBytes(1024 * 1024)).toBe('1,00 MB');
      expect(formatFileSizeBytes(2.5 * 1024 * 1024)).toBe('2,50 MB');
    });

    it('deve lidar com valores nulos ou inválidos', () => {
      expect(formatFileSizeBytes(null)).toBe('0 B');
      expect(formatFileSizeBytes(-50)).toBe('0 B');
    });
  });

  describe('formatFieldLabel e formatErrorCodeLabel', () => {
    it('deve converter identificadores de campo em rótulos amigáveis legíveis', () => {
      expect(formatFieldLabel('latitude')).toBe('Latitude');
      expect(formatFieldLabel('longitude')).toBe('Longitude');
      expect(formatFieldLabel('municipio')).toBe('Município');
      expect(formatFieldLabel('fonte')).toBe('Fonte');
      expect(formatFieldLabel('localidade')).toBe('Localidade');
      expect(formatFieldLabel('data_criacao')).toBe('Data de criação');
      expect(formatFieldLabel('vazao_media')).toBe('Vazão média');
      expect(formatFieldLabel('cabecalho')).toBe('Cabeçalho do arquivo');
      expect(formatFieldLabel(undefined)).toBe('Geral');
    });

    it('deve converter códigos de erro em textos amigáveis e nunca vazar UPPER_SNAKE_CASE', () => {
      expect(formatErrorCodeLabel('REQUIRED_FIELD_EMPTY')).toBe('Campo obrigatório vazio');
      expect(formatErrorCodeLabel('OUT_OF_BOUNDS_CARIRI')).toBe('Coordenada fora da macrorregião do Cariri');
      expect(formatErrorCodeLabel('NEGATIVE_FLOW')).toBe('Vazão média negativa não permitida');
      expect(formatErrorCodeLabel('INVALID_TEXT_LENGTH')).toBe('Tamanho do texto fora do limite permitido');
      expect(formatErrorCodeLabel('FILE_TOO_LARGE')).toBe('Arquivo excede o limite máximo permitido (5 MB)');
      expect(formatErrorCodeLabel('UNKNOWN_INTERNAL_ERROR_CODE')).toBe('Inconsistência nos dados informados');
      expect(formatErrorCodeLabel(undefined)).toBe('Inconsistência de dados');
    });

    it('deve formatar motivos de duplicidade corretamente', () => {
      expect(formatDuplicateReason('DUPLICATE_INTERNAL')).toBe('Duplicada no próprio arquivo');
      expect(formatDuplicateReason('DUPLICATE_DATABASE')).toBe('Já cadastrada na base de dados');
      expect(formatDuplicateReason(undefined)).toBe('Registro duplicado');
    });
  });

  describe('paginateSlice (Paginação O(1) para Grandes Volumes)', () => {
    const mockList = Array.from({ length: 125 }, (_, i) => `Item ${i + 1}`);

    it('deve paginar corretamente a primeira página de 50 itens', () => {
      const result = paginateSlice(mockList, 1, 50);

      expect(result.items.length).toBe(50);
      expect(result.items[0]).toBe('Item 1');
      expect(result.items[49]).toBe('Item 50');
      expect(result.currentPage).toBe(1);
      expect(result.totalPages).toBe(3);
      expect(result.totalItems).toBe(125);
      expect(result.hasPreviousPage).toBe(false);
      expect(result.hasNextPage).toBe(true);
    });

    it('deve paginar a última página contendo os 25 itens restantes', () => {
      const result = paginateSlice(mockList, 3, 50);

      expect(result.items.length).toBe(25);
      expect(result.items[0]).toBe('Item 101');
      expect(result.items[24]).toBe('Item 125');
      expect(result.currentPage).toBe(3);
      expect(result.hasPreviousPage).toBe(true);
      expect(result.hasNextPage).toBe(false);
    });

    it('deve ajustar páginas fora dos limites (clamp seguro)', () => {
      const underflow = paginateSlice(mockList, -5, 50);
      expect(underflow.currentPage).toBe(1);

      const overflow = paginateSlice(mockList, 999, 50);
      expect(overflow.currentPage).toBe(3);
    });

    it('deve lidar com coleções vazias sem quebrar', () => {
      const empty = paginateSlice([], 1, 50);
      expect(empty.items).toEqual([]);
      expect(empty.totalPages).toBe(1);
      expect(empty.totalItems).toBe(0);
      expect(empty.hasPreviousPage).toBe(false);
      expect(empty.hasNextPage).toBe(false);
    });

    it('deve proteger contra entradas não finitas (NaN, Infinity) em page e pageSize', () => {
      const nanPage = paginateSlice(mockList, Number.NaN, 50);
      expect(nanPage.currentPage).toBe(1);
      expect(nanPage.pageSize).toBe(50);
      expect(nanPage.items).toHaveLength(50);

      const infSize = paginateSlice(mockList, 1, Number.POSITIVE_INFINITY);
      expect(infSize.pageSize).toBe(50);
      expect(infSize.items).toHaveLength(50);
    });
  });

  describe('derivePreviewState e canConfirmImportacao', () => {
    it('deve classificar como "valid" com pluralização correta no singular e no plural', () => {
      const dtoPlural = {
        canConfirm: true,
        summary: {
          totalLinhas: 10,
          totalValidas: 8,
          totalInvalidas: 0,
          totalDuplicadas: 2,
        },
        allErrors: [],
      };

      const classificationPlural = derivePreviewState(dtoPlural);
      expect(classificationPlural.kind).toBe('valid');
      expect(classificationPlural.canConfirm).toBe(true);
      expect(classificationPlural.message).toBe(
        'Arquivo validado com sucesso! 8 novas nascentes prontas para confirmação.'
      );
      expect(canConfirmImportacao(dtoPlural)).toBe(true);

      const dtoSingular = {
        canConfirm: true,
        summary: {
          totalLinhas: 1,
          totalValidas: 1,
          totalInvalidas: 0,
          totalDuplicadas: 0,
        },
        allErrors: [],
      };

      const classificationSingular = derivePreviewState(dtoSingular);
      expect(classificationSingular.message).toBe(
        'Arquivo validado com sucesso! 1 nova nascente pronta para confirmação.'
      );
    });

    it('deve classificar como "invalid" quando houver erros impeditivos com singular e plural corretos', () => {
      const dtoPlural = {
        canConfirm: false,
        summary: {
          totalLinhas: 5,
          totalValidas: 3,
          totalInvalidas: 2,
          totalDuplicadas: 0,
        },
        allErrors: [
          { line: 2, field: 'latitude' as const, code: 'OUT_OF_BOUNDS_CARIRI' as const, message: 'Fora do Cariri' },
          { line: 4, field: 'municipio' as const, code: 'REQUIRED_FIELD_EMPTY' as const, message: 'Vazio' },
        ],
      };

      const classificationPlural = derivePreviewState(dtoPlural);
      expect(classificationPlural.kind).toBe('invalid');
      expect(classificationPlural.canConfirm).toBe(false);
      expect(classificationPlural.message).toBe(
        'Validação concluída com falhas. Foram encontrados 2 erros que impedem a importação.'
      );
      expect(classificationPlural.blockingReason).toContain('Corrija os erros apontados');
      expect(canConfirmImportacao(dtoPlural)).toBe(false);

      const dtoSingular = {
        canConfirm: false,
        summary: {
          totalLinhas: 2,
          totalValidas: 1,
          totalInvalidas: 1,
          totalDuplicadas: 0,
        },
        allErrors: [
          { line: 2, field: 'vazao_media' as const, code: 'NEGATIVE_FLOW' as const, message: 'Vazão negativa' },
        ],
      };

      const classificationSingular = derivePreviewState(dtoSingular);
      expect(classificationSingular.message).toBe(
        'Validação concluída com falhas. Foi encontrado 1 erro que impede a importação.'
      );
    });

    it('deve classificar como "empty" quando não houver registros válidos novos para importar (todas duplicadas)', () => {
      const dto = {
        canConfirm: false,
        summary: {
          totalLinhas: 4,
          totalValidas: 0,
          totalInvalidas: 0,
          totalDuplicadas: 4,
        },
        allErrors: [],
      };

      const classification = derivePreviewState(dto);
      expect(classification.kind).toBe('empty');
      expect(classification.canConfirm).toBe(false);
      expect(classification.message).toBe('Nenhum novo registro disponível para inserção.');
      expect(classification.blockingReason).toContain('Todas as 4 linhas do arquivo já estão cadastradas');
      expect(canConfirmImportacao(dto)).toBe(false);
    });

    it('canConfirmImportacao deve retornar falso para DTO nulo ou indefinido', () => {
      expect(canConfirmImportacao(null)).toBe(false);
      expect(canConfirmImportacao(undefined)).toBe(false);
    });

    it('deve bloquear confirmação (kind="invalid") se o servidor indicar canConfirm=false mesmo sem erros listados', () => {
      const dtoDivergent = {
        canConfirm: false,
        summary: {
          totalLinhas: 3,
          totalValidas: 3,
          totalInvalidas: 0,
          totalDuplicadas: 0,
        },
        allErrors: [],
      };

      const classification = derivePreviewState(dtoDivergent);
      expect(classification.kind).toBe('invalid');
      expect(classification.canConfirm).toBe(false);
      expect(classification.blockingReason).toContain(
        'A confirmação deste lote foi bloqueada pela validação do servidor.'
      );
      expect(canConfirmImportacao(dtoDivergent)).toBe(false);
    });
  });
});

describe('Cliente HTTP uploadAndValidateTxt (src/services/importacoes.client.ts)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve lançar erro fail-fast quando nenhum arquivo for informado', async () => {
    await expect(uploadAndValidateTxt(null as unknown as File)).rejects.toThrow(
      'Nenhum arquivo foi selecionado para envio.'
    );
  });

  it('deve lançar erro fail-fast quando a extensão não for .txt', async () => {
    const invalidFile = new File(['teste'], 'dados.csv', { type: 'text/csv' });

    await expect(uploadAndValidateTxt(invalidFile)).rejects.toThrow(
      'Apenas arquivos de texto (.txt) são permitidos.'
    );
  });

  it('deve lançar erro fail-fast quando o arquivo estiver vazio (0 bytes)', async () => {
    const emptyFile = new File([], 'vazio.txt', { type: 'text/plain' });

    await expect(uploadAndValidateTxt(emptyFile)).rejects.toThrow(
      'O arquivo selecionado está vazio (0 bytes).'
    );
  });

  it('deve enviar requisição POST multipart/form-data e retornar DTO no sucesso (200 OK)', async () => {
    const validFile = new File(['latitude;longitude\n-7.2;-39.3'], 'nascentes.txt', {
      type: 'text/plain',
    });

    const mockResponseDto: ImportacaoValidationResponseDto = {
      importacaoId: 101,
      nomeArquivo: 'nascentes.txt',
      hashSha256: 'abc123canonicalhash',
      tamanhoBytes: 50,
      status: 'AGUARDANDO_CONFIRMACAO',
      canConfirm: true,
      summary: {
        totalLinhas: 1,
        totalValidas: 1,
        totalInvalidas: 0,
        totalDuplicadas: 0,
      },
      validRows: [],
      duplicateRows: [],
      invalidRows: [],
      allErrors: [],
      createdAt: '2026-11-12T10:00:00.000Z',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockResponseDto),
    });

    globalThis.fetch = mockFetch;

    const result = await uploadAndValidateTxt(validFile, {
      authToken: 'test-admin-token',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/importacoes/validar',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: expect.any(FormData),
      })
    );

    const callHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(callHeaders.get('Authorization')).toBe('Bearer test-admin-token');
    expect(callHeaders.get('Accept')).toBe('application/json');

    expect(result).toEqual(mockResponseDto);
  });

  it('deve tratar erro 401 mapeando mensagem de autenticação amigável', async () => {
    const file = new File(['conteudo'], 'nascentes.txt', { type: 'text/plain' });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    });

    await expect(uploadAndValidateTxt(file)).rejects.toThrow(
      'Sessão expirada ou não autorizada. Faça login novamente para continuar.'
    );
  });

  it('deve tratar erro 413 mapeando aviso de arquivo acima de 5 MB', async () => {
    const file = new File(['conteudo'], 'nascentes.txt', { type: 'text/plain' });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    });

    await expect(uploadAndValidateTxt(file)).rejects.toThrow(
      'O arquivo enviado excede o limite máximo permitido (5 MB).'
    );
  });

  it('deve extrair mensagem de erro detalhada retornada pela API com envelope JSON', async () => {
    const file = new File(['conteudo'], 'nascentes.txt', { type: 'text/plain' });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: 'Arquivo corrompido com bytes nulos.',
        code: 'BINARY_FILE_NOT_ALLOWED',
      }),
    });

    try {
      await uploadAndValidateTxt(file);
      expect.unreachable('Deveria ter lançado ImportacaoClientError');
    } catch (err) {
      expect(err).toBeInstanceOf(ImportacaoClientError);
      const clientErr = err as ImportacaoClientError;
      expect(clientErr.message).toBe('Arquivo corrompido com bytes nulos.');
      expect(clientErr.statusCode).toBe(400);
      expect(clientErr.code).toBe('BINARY_FILE_NOT_ALLOWED');
    }
  });

  it('deve capturar falhas de rede e encapsular com mensagem amigável e isNetworkError: true', async () => {
    const file = new File(['conteudo'], 'nascentes.txt', { type: 'text/plain' });

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    try {
      await uploadAndValidateTxt(file);
      expect.unreachable('Deveria ter lançado erro de rede');
    } catch (err) {
      expect(err).toBeInstanceOf(ImportacaoClientError);
      const clientErr = err as ImportacaoClientError;
      expect(clientErr.isNetworkError).toBe(true);
      expect(clientErr.message).toContain('Dificuldade de conexão com o servidor');
    }
  });

  it('deve propagar AbortError quando a requisição for cancelada via signal', async () => {
    const file = new File(['conteudo'], 'nascentes.txt', { type: 'text/plain' });

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(uploadAndValidateTxt(file)).rejects.toThrow('The operation was aborted');
  });

  it('deve bloquear envio fail-fast no cliente quando o arquivo exceder 5 MB', async () => {
    const oversizedFile = new File(['a'], 'grande.txt', { type: 'text/plain' });
    Object.defineProperty(oversizedFile, 'size', { value: 5 * 1024 * 1024 + 1 });

    await expect(uploadAndValidateTxt(oversizedFile)).rejects.toThrow(
      'O arquivo selecionado excede o limite máximo permitido (5 MB).'
    );
  });

  it('deve rejeitar payload malformado da API que viole o contrato Zod (INVALID_SERVER_RESPONSE)', async () => {
    const file = new File(['conteudo'], 'nascentes.txt', { type: 'text/plain' });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        importacaoId: 'invalido',
        canConfirm: 'sim',
      }),
    });

    try {
      await uploadAndValidateTxt(file);
      expect.unreachable('Deveria ter rejeitado resposta fora do contrato');
    } catch (err) {
      expect(err).toBeInstanceOf(ImportacaoClientError);
      const clientErr = err as ImportacaoClientError;
      expect(clientErr.code).toBe('INVALID_SERVER_RESPONSE');
      expect(clientErr.statusCode).toBe(200);
    }
  });

  it('deve usar mensagem amigável padronizada em erros 500 quando a resposta não for JSON estruturado', async () => {
    const file = new File(['conteudo'], 'nascentes.txt', { type: 'text/plain' });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('HTML 500 Gateway Error')),
    });

    await expect(uploadAndValidateTxt(file)).rejects.toThrow(
      'Erro interno no servidor ao processar o arquivo. Tente novamente mais tarde.'
    );
  });
});

describe('Cliente HTTP confirmImportacaoById e cancelImportacaoById (src/services/importacoes.client.ts)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const MOCK_CONFIRM_RESPONSE: ImportacaoConfirmResponseDto = {
    importacaoId: 42,
    nomeArquivo: 'nascentes-cariri.txt',
    hashSha256: 'a'.repeat(64),
    status: 'CONCLUIDA',
    summary: {
      totalLinhas: 5,
      totalInseridas: 4,
      totalDuplicadas: 1,
      totalInvalidas: 0,
    },
    cacheInvalidated: true,
    concluidaAt: '2026-11-15T18:00:00.000Z',
  };

  const MOCK_CANCEL_RESPONSE: ImportacaoCancelResponseDto = {
    importacaoId: 88,
    nomeArquivo: 'nascentes-pendente.txt',
    hashSha256: 'b'.repeat(64),
    status: 'CANCELADA',
    mensagemErro: 'Importação cancelada pelo administrador antes da confirmação.',
    concluidaAt: '2026-11-15T18:05:00.000Z',
  };

  it('confirmImportacaoById deve rejeitar IDs inválidos no cliente sem chamar fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    for (const invalidId of [0, -3, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(confirmImportacaoById(invalidId)).rejects.toMatchObject({
        name: 'ImportacaoClientError',
        statusCode: 400,
        code: 'INVALID_IMPORTACAO_INPUT',
      });
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('confirmImportacaoById deve enviar POST /api/admin/importacoes/[id]/confirmar e retornar DTO validado (200 OK)', async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(MOCK_CONFIRM_RESPONSE),
    });
    globalThis.fetch = mockFetch;

    const result = await confirmImportacaoById(42, {
      authToken: 'admin-jwt-token',
      signal: controller.signal,
    });

    expect(result).toEqual(MOCK_CONFIRM_RESPONSE);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/importacoes/42/confirmar',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: expect.any(Headers),
      })
    );

    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer admin-jwt-token');
  });

  it('confirmImportacaoById deve mapear erros estruturados (403, 404, 409, 422) e fallback 500 não-JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({
        error: 'A importação 42 já foi confirmada anteriormente.',
        code: 'IMPORTACAO_ALREADY_PROCESSED',
      }),
    });

    await expect(confirmImportacaoById(42)).rejects.toMatchObject({
      statusCode: 409,
      code: 'IMPORTACAO_ALREADY_PROCESSED',
      message: 'A importação 42 já foi confirmada anteriormente.',
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('HTML 500')),
    });

    await expect(confirmImportacaoById(42)).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno no servidor ao confirmar a importação. Tente novamente mais tarde.',
    });
  });

  it('confirmImportacaoById deve rejeitar payload 200 fora do schema Zod e propagar AbortError sem mascaramento', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ importacaoId: 42, status: 'PENDENTE_DESCONHECIDO' }),
    });

    await expect(confirmImportacaoById(42)).rejects.toMatchObject({
      statusCode: 200,
      code: 'INVALID_SERVER_RESPONSE',
    });

    const abortErr = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr);

    await expect(confirmImportacaoById(42)).rejects.toBe(abortErr);

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(confirmImportacaoById(42)).rejects.toMatchObject({
      isNetworkError: true,
    });
  });

  it('cancelImportacaoById deve rejeitar IDs inválidos no cliente sem chamar fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    for (const invalidId of [0, -1, 2.75]) {
      await expect(cancelImportacaoById(invalidId)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_IMPORTACAO_INPUT',
      });
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cancelImportacaoById deve enviar DELETE /api/admin/importacoes/[id] e retornar DTO validado (200 OK)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(MOCK_CANCEL_RESPONSE),
    });
    globalThis.fetch = mockFetch;

    const result = await cancelImportacaoById(88, { authToken: 'cancel-token' });

    expect(result).toEqual(MOCK_CANCEL_RESPONSE);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/importacoes/88',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'same-origin',
        headers: expect.any(Headers),
      })
    );
  });

  it('cancelImportacaoById deve mapear erro 404/409, fallback 500 de cancelamento e schema 200 inválido', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({
        error: 'Importação com ID 88 não foi encontrada.',
        code: 'IMPORTACAO_NOT_FOUND',
      }),
    });

    await expect(cancelImportacaoById(88)).rejects.toMatchObject({
      statusCode: 404,
      code: 'IMPORTACAO_NOT_FOUND',
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('500 Plain Text')),
    });

    await expect(cancelImportacaoById(88)).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno no servidor ao cancelar a importação. Tente novamente mais tarde.',
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ importacaoId: 88, status: 'CONCLUIDA' }),
    });

    await expect(cancelImportacaoById(88)).rejects.toMatchObject({
      statusCode: 200,
      code: 'INVALID_SERVER_RESPONSE',
    });
  });
});

describe('Persistência Temporária de Prévia em sessionStorage (src/services/importacoes.client.ts)', () => {
  function createMockStorage(): Storage {
    const store = new Map<string, string>();
    return {
      get length(): number {
        return store.size;
      },
      clear(): void {
        store.clear();
      },
      getItem(key: string): string | null {
        return store.has(key) ? (store.get(key) ?? null) : null;
      },
      key(index: number): string | null {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string): void {
        store.delete(key);
      },
      setItem(key: string, value: string): void {
        store.set(key, value);
      },
    };
  }

  function createValidationDto(
    overrides?: Partial<ImportacaoValidationResponseDto>
  ): ImportacaoValidationResponseDto {
    return {
      importacaoId: 202,
      nomeArquivo: 'previa-cariri.txt',
      hashSha256: 'c'.repeat(64),
      tamanhoBytes: 128,
      status: 'AGUARDANDO_CONFIRMACAO',
      canConfirm: true,
      summary: {
        totalLinhas: 1,
        totalValidas: 1,
        totalInvalidas: 0,
        totalDuplicadas: 0,
      },
      validRows: [
        {
          line: 2,
          duplicateKey: '-7.228900|-39.414400|fonte da batateira',
          data: {
            latitude: -7.2289,
            longitude: -39.4144,
            municipio: 'Crato',
            fonte: 'Fonte da Batateira',
            localidade: 'Sítio Fundão',
            dataCriacaoIso: '2024-05-10',
            dataCriacao: '2024-05-10T00:00:00.000Z',
            vazaoMedia: 0.45,
            unidadeVazao: 'm³/s',
          },
        },
      ],
      duplicateRows: [],
      invalidRows: [],
      allErrors: [],
      createdAt: '2026-11-15T17:00:00.000Z',
      ...overrides,
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deve operar sem erro e retornar null em ambiente sem window (SSR / Node)', () => {
    const dto = createValidationDto();
    expect(() => savePreviewSession(dto)).not.toThrow();
    expect(loadPreviewSession()).toBeNull();
    expect(() => clearPreviewSession()).not.toThrow();
  });

  it('deve salvar e recuperar prévia recuperável (AGUARDANDO_CONFIRMACAO e FALHOU) em sessionStorage', () => {
    const mockStorage = createMockStorage();
    vi.stubGlobal('window', { sessionStorage: mockStorage });

    const pendingDto = createValidationDto({ status: 'AGUARDANDO_CONFIRMACAO', canConfirm: true });
    savePreviewSession(pendingDto);
    expect(mockStorage.getItem(IMPORTACAO_PREVIEW_STORAGE_KEY)).not.toBeNull();
    expect(loadPreviewSession()).toEqual(pendingDto);

    const failedDto = createValidationDto({
      importacaoId: 203,
      status: 'FALHOU',
      canConfirm: false,
      summary: {
        totalLinhas: 1,
        totalValidas: 0,
        totalInvalidas: 1,
        totalDuplicadas: 0,
      },
      validRows: [],
      allErrors: [
        {
          line: 2,
          field: 'vazao_media',
          code: 'NEGATIVE_FLOW',
          message: 'Vazão média não pode ser negativa.',
          rawValue: '-1.5',
        },
      ],
    });
    savePreviewSession(failedDto);
    expect(loadPreviewSession()).toEqual(failedDto);

    clearPreviewSession();
    expect(mockStorage.getItem(IMPORTACAO_PREVIEW_STORAGE_KEY)).toBeNull();
    expect(loadPreviewSession()).toBeNull();
  });

  it('não deve salvar estados finais (CONCLUIDA / CANCELADA) e deve limpar JSON corrompido ou expirado', () => {
    const mockStorage = createMockStorage();
    vi.stubGlobal('window', { sessionStorage: mockStorage });

    savePreviewSession(createValidationDto({ status: 'CONCLUIDA' }));
    savePreviewSession(createValidationDto({ status: 'CANCELADA' }));
    expect(mockStorage.getItem(IMPORTACAO_PREVIEW_STORAGE_KEY)).toBeNull();

    mockStorage.setItem(IMPORTACAO_PREVIEW_STORAGE_KEY, '{json-corrompido');
    expect(loadPreviewSession()).toBeNull();
    expect(mockStorage.getItem(IMPORTACAO_PREVIEW_STORAGE_KEY)).toBeNull();

    mockStorage.setItem(
      IMPORTACAO_PREVIEW_STORAGE_KEY,
      JSON.stringify(createValidationDto({ status: 'CONCLUIDA' }))
    );
    expect(loadPreviewSession()).toBeNull();
    expect(mockStorage.getItem(IMPORTACAO_PREVIEW_STORAGE_KEY)).toBeNull();
  });
});
