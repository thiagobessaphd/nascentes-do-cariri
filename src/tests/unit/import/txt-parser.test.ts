/**
 * Suíte de Testes Unitários: Parser de Arquivos TXT de Nascentes (CT-BE-06)
 *
 * Validação rigorosa dos requisitos funcionais (RF04, RF05), das regras de negócio
 * da Seção 6 de REQUISITOS_MAPA_NASCENTES_DO_CARIRI.md e da Seção 13 de agent_TYPESCRIPT.md.
 */

import { describe, expect, it } from 'vitest';
import { CARIRI_BOUNDS } from '@/lib/domain/nascente';
import {
  buildNascenteDuplicateKey,
  decodeTxtContent,
  parseNascentesTxt,
  parseTxtLine,
  validateTxtHeader,
} from '@/modules/importacoes/txt-parser';
import {
  DUPLICATE_REASONS,
  EXPECTED_TXT_HEADER_STRING,
  IMPORT_ERROR_CODES,
  UNIDADE_VAZAO_PADRAO,
} from '@/modules/importacoes/importacoes.types';

describe('Parser e Validador Linha a Linha de TXT (CT-BE-06)', () => {
  const CABECALHO_VALIDO = EXPECTED_TXT_HEADER_STRING;

  const LINHA_VALIDA_CRATO =
    '-7.234567;-39.345678;Crato;Nascente do Sítio Fundão;Distrito de Santa Fé;2026-01-10;2.75';
  const LINHA_VALIDA_BARBALHA =
    '-7.334700;-39.411900;Barbalha;Fonte Gruta do Farias;Arajara;2025-08-12;1.40';

  describe('1. Decodificação e Normalização UTF-8 (decodeTxtContent)', () => {
    it('deve decodificar string padrão, Uint8Array e ArrayBuffer UTF-8 corretamente', () => {
      const texto = `${CABECALHO_VALIDO}\n${LINHA_VALIDA_CRATO}`;
      expect(decodeTxtContent(texto)).toBe(texto);

      const encoder = new TextEncoder();
      const buffer = encoder.encode(texto);
      expect(decodeTxtContent(buffer)).toBe(texto);
      expect(decodeTxtContent(buffer.buffer)).toBe(texto);
    });

    it('deve remover Byte Order Mark (BOM) UTF-8 inicial sem corromper a primeira coluna', () => {
      const comBom = `\uFEFF${CABECALHO_VALIDO}\n${LINHA_VALIDA_CRATO}`;
      const decodificado = decodeTxtContent(comBom);

      expect(decodificado.startsWith('\uFEFF')).toBe(false);
      expect(decodificado.startsWith('latitude;')).toBe(true);
    });

    it('deve capturar falhas de decodificação UTF-8 quando os bytes forem inválidos', () => {
      // Sequência de bytes inválida em UTF-8
      const bytesInvalidos = new Uint8Array([0xff, 0xfe, 0x80, 0xbf]);

      expect(() => decodeTxtContent(bytesInvalidos)).toThrow();

      const resultado = parseNascentesTxt(bytesInvalidos);
      expect(resultado.headerValid).toBe(false);
      expect(resultado.canConfirm).toBe(false);
      expect(resultado.allErrors[0]?.code).toBe(IMPORT_ERROR_CODES.INVALID_ENCODING);
    });
  });

  describe('2. Validação do Cabeçalho Canônico (validateTxtHeader — CT-BE-06)', () => {
    it('deve aprovar o cabeçalho oficial com 7 colunas separadas por ponto e vírgula', () => {
      const outcome = validateTxtHeader(CABECALHO_VALIDO, 1);

      expect(outcome.valid).toBe(true);
      if (outcome.valid) {
        expect(outcome.columns).toHaveLength(7);
        expect(outcome.columns[0]).toBe('latitude');
        expect(outcome.columns[6]).toBe('vazao_media');
      }
    });

    it('deve realizar trim nos nomes das colunas do cabeçalho', () => {
      const cabecalhoComEspacos =
        '  latitude  ; longitude ;  municipio  ; fonte ; localidade ; data_criacao ; vazao_media  ';
      const outcome = validateTxtHeader(cabecalhoComEspacos, 1);

      expect(outcome.valid).toBe(true);
      if (outcome.valid) {
        expect(outcome.columns).toEqual([
          'latitude',
          'longitude',
          'municipio',
          'fonte',
          'localidade',
          'data_criacao',
          'vazao_media',
        ]);
      }
    });

    it('deve rejeitar cabeçalho vazio', () => {
      const outcome = validateTxtHeader('   ', 1);

      expect(outcome.valid).toBe(false);
      if (!outcome.valid) {
        expect(outcome.error.code).toBe(IMPORT_ERROR_CODES.INVALID_HEADER);
        expect(outcome.error.field).toBe('cabecalho');
        expect(outcome.error.line).toBe(1);
      }
    });

    it('deve rejeitar cabeçalho com colunas faltantes ou a menos', () => {
      const cabecalhoFaltante = 'latitude;longitude;municipio;fonte;localidade;data_criacao';
      const outcome = validateTxtHeader(cabecalhoFaltante, 1);

      expect(outcome.valid).toBe(false);
      if (!outcome.valid) {
        expect(outcome.error.code).toBe(IMPORT_ERROR_CODES.INVALID_HEADER);
        expect(outcome.error.message).toContain('Cabeçalho incorreto ou ausente');
      }
    });

    it('deve rejeitar cabeçalho com colunas excedentes', () => {
      const cabecalhoExtra = `${CABECALHO_VALIDO};coluna_extra`;
      const outcome = validateTxtHeader(cabecalhoExtra, 1);

      expect(outcome.valid).toBe(false);
      if (!outcome.valid) {
        expect(outcome.error.code).toBe(IMPORT_ERROR_CODES.INVALID_HEADER);
      }
    });

    it('deve rejeitar cabeçalho com ordem trocada de colunas', () => {
      const cabecalhoInvertido =
        'longitude;latitude;municipio;fonte;localidade;data_criacao;vazao_media';
      const outcome = validateTxtHeader(cabecalhoInvertido, 1);

      expect(outcome.valid).toBe(false);
      if (!outcome.valid) {
        expect(outcome.error.code).toBe(IMPORT_ERROR_CODES.INVALID_HEADER);
        expect(outcome.error.message).toContain('Esperado: "latitude;longitude');
      }
    });

    it('deve rejeitar arquivo onde a primeira linha já contém dados numéricos (sem cabeçalho)', () => {
      const arquivoSemCabecalho = `${LINHA_VALIDA_CRATO}\n${LINHA_VALIDA_BARBALHA}`;
      const resultado = parseNascentesTxt(arquivoSemCabecalho);

      expect(resultado.headerValid).toBe(false);
      expect(resultado.canConfirm).toBe(false);
      expect(resultado.allErrors[0]?.code).toBe(IMPORT_ERROR_CODES.INVALID_HEADER);
      expect(resultado.summary.totalInvalidas).toBe(1);
    });
  });

  describe('3. Normalização de Chave e Duplicidade (buildNascenteDuplicateKey)', () => {
    it('deve gerar chave determinística com 8 casas decimais, sem acentos e fonte normalizada (compatível com utf8mb4_unicode_ci)', () => {
      const key1 = buildNascenteDuplicateKey(-7.234567, -39.345678, 'Nascente do Sítio Fundão');
      const key2 = buildNascenteDuplicateKey(-7.234567, -39.345678, '  NASCENTE   DO   SÍTIO   FUNDÃO  ');
      const key3 = buildNascenteDuplicateKey(-7.234567, -39.345678, 'nascente do sitio fundao');

      expect(key1).toBe('-7.23456700:-39.34567800:nascente do sitio fundao');
      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
    });

    it('deve identificar duplicidade interna no mesmo arquivo TXT', () => {
      const conteudo = [
        CABECALHO_VALIDO,
        LINHA_VALIDA_CRATO,
        LINHA_VALIDA_BARBALHA,
        // Duplicata da linha 2 na linha 4 com espaçamento e caixa alta na fonte
        '-7.234567;-39.345678;Crato;  NASCENTE DO SÍTIO FUNDÃO  ;Outra Localidade;2026-02-01;3.00',
      ].join('\n');

      const resultado = parseNascentesTxt(conteudo);

      expect(resultado.headerValid).toBe(true);
      expect(resultado.canConfirm).toBe(true); // Duplicados não impedem confirmação
      expect(resultado.summary.totalLinhas).toBe(3);
      expect(resultado.summary.totalValidas).toBe(2);
      expect(resultado.summary.totalDuplicadas).toBe(1);
      expect(resultado.summary.totalInvalidas).toBe(0);

      expect(resultado.duplicateRows).toHaveLength(1);
      expect(resultado.duplicateRows[0]?.line).toBe(4);
      expect(resultado.duplicateRows[0]?.duplicateOfLine).toBe(2);
      expect(resultado.duplicateRows[0]?.reason).toBe(DUPLICATE_REASONS.INTERNAL);
    });

    it('deve identificar duplicidade contra chaves pré-existentes no banco de dados', () => {
      const chaveExistenteNoBanco = buildNascenteDuplicateKey(
        -7.234567,
        -39.345678,
        'Nascente do Sítio Fundão'
      );

      const existingKeys = new Set([chaveExistenteNoBanco]);
      const conteudo = `${CABECALHO_VALIDO}\n${LINHA_VALIDA_CRATO}\n${LINHA_VALIDA_BARBALHA}`;

      const resultado = parseNascentesTxt(conteudo, { existingKeys });

      expect(resultado.summary.totalLinhas).toBe(2);
      expect(resultado.summary.totalValidas).toBe(1);
      expect(resultado.summary.totalDuplicadas).toBe(1);
      expect(resultado.duplicateRows[0]?.reason).toBe(DUPLICATE_REASONS.DATABASE);
      expect(resultado.duplicateRows[0]?.line).toBe(2);
    });
  });

  describe('4. Quebras de Linha e Numeração Física das Linhas', () => {
    it('deve processar arquivos com quebras de linha Windows CRLF (\\r\\n) e Unix LF (\\n)', () => {
      const conteudoCrlf = `${CABECALHO_VALIDO}\r\n${LINHA_VALIDA_CRATO}\r\n${LINHA_VALIDA_BARBALHA}`;
      const resultadoCrlf = parseNascentesTxt(conteudoCrlf);

      expect(resultadoCrlf.summary.totalValidas).toBe(2);
      expect(resultadoCrlf.validRows[0]?.line).toBe(2);
      expect(resultadoCrlf.validRows[1]?.line).toBe(3);

      const conteudoLf = `${CABECALHO_VALIDO}\n${LINHA_VALIDA_CRATO}\n${LINHA_VALIDA_BARBALHA}`;
      const resultadoLf = parseNascentesTxt(conteudoLf);

      expect(resultadoLf.summary.totalValidas).toBe(2);
    });

    it('deve ignorar linhas vazias intercaladas preservando o número da linha física real', () => {
      const conteudoComLinhasVazias = [
        CABECALHO_VALIDO, // linha 1
        '',               // linha 2 (vazia)
        LINHA_VALIDA_CRATO, // linha 3
        '   ',            // linha 4 (apenas espaços)
        LINHA_VALIDA_BARBALHA, // linha 5
        '',               // linha 6 (vazia)
      ].join('\n');

      const resultado = parseNascentesTxt(conteudoComLinhasVazias);

      expect(resultado.summary.totalLinhas).toBe(2);
      expect(resultado.summary.totalValidas).toBe(2);
      expect(resultado.validRows[0]?.line).toBe(3);
      expect(resultado.validRows[1]?.line).toBe(5);
    });
  });

  describe('5. Validação de Linha e Campos Individuais (parseTxtLine)', () => {
    it('deve rejeitar linha com quantidade de colunas diferente de 7', () => {
      const menosColunas = '-7.234567;-39.345678;Crato;Nascente';
      const outcomeMenos = parseTxtLine(menosColunas, 10);

      expect(outcomeMenos.valid).toBe(false);
      if (!outcomeMenos.valid) {
        expect(outcomeMenos.errors[0]?.code).toBe(IMPORT_ERROR_CODES.INVALID_COLUMN_COUNT);
        expect(outcomeMenos.errors[0]?.line).toBe(10);
      }

      const maisColunas = `${LINHA_VALIDA_CRATO};coluna_extra_8`;
      const outcomeMais = parseTxtLine(maisColunas, 12);

      expect(outcomeMais.valid).toBe(false);
      if (!outcomeMais.valid) {
        expect(outcomeMais.errors[0]?.code).toBe(IMPORT_ERROR_CODES.INVALID_COLUMN_COUNT);
      }
    });

    describe('Validações de Latitude e Longitude', () => {
      it('deve rejeitar latitude e longitude com vírgula em vez de ponto', () => {
        const linhaComVirgula =
          '-7,234567;-39,345678;Crato;Nascente Teste;Localidade;2026-01-01;2.00';
        const outcome = parseTxtLine(linhaComVirgula, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'latitude' && e.code === IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT)).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'longitude' && e.code === IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT)).toBe(true);
        }
      });

      it('deve rejeitar latitude e longitude não numéricas', () => {
        const linhaNaoNumerica =
          'lat_invalida;lng_invalida;Crato;Nascente Teste;Localidade;2026-01-01;2.00';
        const outcome = parseTxtLine(linhaNaoNumerica, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'latitude' && e.code === IMPORT_ERROR_CODES.INVALID_COORDINATE)).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'longitude' && e.code === IMPORT_ERROR_CODES.INVALID_COORDINATE)).toBe(true);
        }
      });

      it('deve rejeitar coordenadas fora dos limites globais [-90, 90] e [-180, 180]', () => {
        const foraGlobo = '95.000000;185.000000;Crato;Nascente;Localidade;2026-01-01;2.00';
        const outcome = parseTxtLine(foraGlobo, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.code === IMPORT_ERROR_CODES.OUT_OF_BOUNDS_GLOBAL)).toBe(true);
        }
      });

      it('deve rejeitar coordenadas fora da macrorregião do Cariri Cearense em latitude e longitude (CT-BE-07)', () => {
        // Latitude fora do Cariri (-3.731900 < -8.0 ou > -6.5) e longitude dentro (-39.400000)
        const latFora = '-3.731900;-39.400000;Fortaleza;Nascente Longe;Praia;2026-01-01;2.00';
        const outcomeLat = parseTxtLine(latFora, 2);

        expect(outcomeLat.valid).toBe(false);
        if (!outcomeLat.valid) {
          expect(
            outcomeLat.errors.some(
              (e) => e.field === 'latitude' && e.code === IMPORT_ERROR_CODES.OUT_OF_BOUNDS_CARIRI
            )
          ).toBe(true);
          expect(outcomeLat.errors.find((e) => e.code === IMPORT_ERROR_CODES.OUT_OF_BOUNDS_CARIRI)?.message).toContain(
            `[${CARIRI_BOUNDS.MIN_LAT}, ${CARIRI_BOUNDS.MAX_LAT}]`
          );
        }

        // Longitude fora do Cariri (-35.000000 > -38.5) e latitude dentro (-7.228900)
        const lngFora = '-7.228900;-35.000000;Paraíba;Nascente Leste;Leste;2026-01-01;2.00';
        const outcomeLng = parseTxtLine(lngFora, 2);

        expect(outcomeLng.valid).toBe(false);
        if (!outcomeLng.valid) {
          expect(
            outcomeLng.errors.some(
              (e) => e.field === 'longitude' && e.code === IMPORT_ERROR_CODES.OUT_OF_BOUNDS_CARIRI
            )
          ).toBe(true);
          expect(outcomeLng.errors.find((e) => e.code === IMPORT_ERROR_CODES.OUT_OF_BOUNDS_CARIRI)?.message).toContain(
            `[${CARIRI_BOUNDS.MIN_LNG}, ${CARIRI_BOUNDS.MAX_LNG}]`
          );
        }
      });

      it('deve aceitar coordenadas exatamente nos limites de fronteira do Cariri', () => {
        const linhaBorda = `${CARIRI_BOUNDS.MIN_LAT};${CARIRI_BOUNDS.MIN_LNG};Crato;Nascente Borda;Fronteira;2026-01-01;1.00`;
        const outcome = parseTxtLine(linhaBorda, 2);

        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
          expect(outcome.data.latitude).toBe(CARIRI_BOUNDS.MIN_LAT);
          expect(outcome.data.longitude).toBe(CARIRI_BOUNDS.MIN_LNG);
        }
      });
    });

    describe('Validações de Campos Textuais (Município, Fonte, Localidade)', () => {
      it('deve rejeitar campos textuais vazios ou contendo apenas espaços (CT-BE-10)', () => {
        const camposVazios = '-7.234567;-39.345678;   ;   ;   ;2026-01-01;2.00';
        const outcome = parseTxtLine(camposVazios, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'municipio' && e.code === IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY)).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'fonte' && e.code === IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY)).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'localidade' && e.code === IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY)).toBe(true);
        }
      });

      it('deve rejeitar textos que excedam os limites máximos permitidos', () => {
        const municipioLongo = 'M'.repeat(151);
        const fonteLonga = 'F'.repeat(256);
        const localidadeLonga = 'L'.repeat(256);

        const linhaExcesso = `-7.234567;-39.345678;${municipioLongo};${fonteLonga};${localidadeLonga};2026-01-01;2.00`;
        const outcome = parseTxtLine(linhaExcesso, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'municipio' && e.code === IMPORT_ERROR_CODES.INVALID_TEXT_LENGTH)).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'fonte' && e.code === IMPORT_ERROR_CODES.INVALID_TEXT_LENGTH)).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'localidade' && e.code === IMPORT_ERROR_CODES.INVALID_TEXT_LENGTH)).toBe(true);
        }
      });

      it('deve remover caracteres de controle dos campos de texto preservando o conteúdo válido', () => {
        const linhaComControle =
          '-7.234567;-39.345678;Crato\u0000;Nascente\u001FFundão;Localidade\u0007Teste;2026-01-01;2.00';
        const outcome = parseTxtLine(linhaComControle, 2);

        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
          expect(outcome.data.municipio).toBe('Crato');
          expect(outcome.data.fonte).toBe('NascenteFundão');
          expect(outcome.data.localidade).toBe('LocalidadeTeste');
        }
      });
    });

    describe('Validações de Data de Criação (CT-BE-08)', () => {
      it('deve rejeitar data que não siga o formato estrito AAAA-MM-DD', () => {
        const formatosInvalidos = [
          '10/01/2026',
          '2026/01/10',
          '2026-1-10',
          'data-invalida',
        ];

        for (const dataInv of formatosInvalidos) {
          const linha = `-7.234567;-39.345678;Crato;Nascente;Localidade;${dataInv};2.00`;
          const outcome = parseTxtLine(linha, 2);
          expect(outcome.valid).toBe(false);
          if (!outcome.valid) {
            expect(outcome.errors.some((e) => e.field === 'data_criacao' && e.code === IMPORT_ERROR_CODES.INVALID_DATE_FORMAT)).toBe(true);
          }
        }
      });

      it('deve rejeitar data inexistente no calendário (ex: 30 de fevereiro)', () => {
        const dataInexistente = '-7.234567;-39.345678;Crato;Nascente;Localidade;2026-02-30;2.00';
        const outcome = parseTxtLine(dataInexistente, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'data_criacao' && e.code === IMPORT_ERROR_CODES.INVALID_CALENDAR_DATE)).toBe(true);
        }
      });

      it('deve validar corretamente anos bissextos (29 de fevereiro)', () => {
        // 2024 é bissexto -> Válido
        const bissextoValido = '-7.234567;-39.345678;Crato;Nascente;Localidade;2024-02-29;2.00';
        expect(parseTxtLine(bissextoValido, 2).valid).toBe(true);

        // 2023 NÃO é bissexto -> Inválido
        const bissextoInvalido = '-7.234567;-39.345678;Crato;Nascente;Localidade;2023-02-29;2.00';
        const outcome = parseTxtLine(bissextoInvalido, 2);
        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.code === IMPORT_ERROR_CODES.INVALID_CALENDAR_DATE)).toBe(true);
        }
      });

      it('deve rejeitar data futura', () => {
        const anoFuturo = new Date().getFullYear() + 2;
        const dataFutura = `-7.234567;-39.345678;Crato;Nascente;Localidade;${anoFuturo}-01-01;2.00`;
        const outcome = parseTxtLine(dataFutura, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'data_criacao' && e.code === IMPORT_ERROR_CODES.FUTURE_DATE)).toBe(true);
        }
      });

      it('deve preservar a data civil em UTC 00:00:00.000Z sem deslocamento de fuso', () => {
        const outcome = parseTxtLine(LINHA_VALIDA_CRATO, 2);

        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
          expect(outcome.data.dataCriacaoIso).toBe('2026-01-10');
          expect(outcome.data.dataCriacao.getUTCFullYear()).toBe(2026);
          expect(outcome.data.dataCriacao.getUTCMonth()).toBe(0); // Janeiro
          expect(outcome.data.dataCriacao.getUTCDate()).toBe(10);
        }
      });
    });

    describe('Validações de Vazão Média (CT-BE-09)', () => {
      it('deve permitir vazão média igual a zero (nascente temporariamente seca)', () => {
        const vazaoZero = '-7.234567;-39.345678;Crato;Nascente;Localidade;2026-01-01;0';
        const outcome = parseTxtLine(vazaoZero, 2);

        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
          expect(outcome.data.vazaoMedia).toBe(0);
          expect(outcome.data.unidadeVazao).toBe(UNIDADE_VAZAO_PADRAO);
        }
      });

      it('deve rejeitar vazão negativa', () => {
        const vazaoNegativa = '-7.234567;-39.345678;Crato;Nascente;Localidade;2026-01-01;-1.50';
        const outcome = parseTxtLine(vazaoNegativa, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'vazao_media' && e.code === IMPORT_ERROR_CODES.NEGATIVE_FLOW)).toBe(true);
        }
      });

      it('deve rejeitar vazão com sinal negativo mesmo sendo zero (-0 ou -0.00)', () => {
        const vazaoZeroNegativo = '-7.234567;-39.345678;Crato;Nascente;Localidade;2026-01-01;-0.00';
        const outcome = parseTxtLine(vazaoZeroNegativo, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'vazao_media' && e.code === IMPORT_ERROR_CODES.NEGATIVE_FLOW)).toBe(true);
        }
      });

      it('deve rejeitar vazão que exceda o limite máximo de DECIMAL(10,3) do banco', () => {
        const vazaoExcedente = '-7.234567;-39.345678;Crato;Nascente;Localidade;2026-01-01;10000000.00';
        const outcome = parseTxtLine(vazaoExcedente, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'vazao_media' && e.code === IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT)).toBe(true);
          expect(outcome.errors.find((e) => e.field === 'vazao_media')?.message).toContain('9999999.999');
        }
      });

      it('deve rejeitar vazão com vírgula em vez de ponto', () => {
        const vazaoVirgula = '-7.234567;-39.345678;Crato;Nascente;Localidade;2026-01-01;2,75';
        const outcome = parseTxtLine(vazaoVirgula, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'vazao_media' && e.code === IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT)).toBe(true);
        }
      });

      it('deve rejeitar vazão não numérica', () => {
        const vazaoTexto = '-7.234567;-39.345678;Crato;Nascente;Localidade;2026-01-01;cinco';
        const outcome = parseTxtLine(vazaoTexto, 2);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.some((e) => e.field === 'vazao_media' && e.code === IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT)).toBe(true);
        }
      });
    });

    describe('Acúmulo de Múltiplos Erros na Mesma Linha', () => {
      it('deve acumular todos os erros distintos encontrados em uma mesma linha', () => {
        // Linha com: latitude vazia, longitude com vírgula, data inexistente e vazão negativa
        const linhaMultiplosErros = ' ; -39,1234 ; Crato ; Fonte ; Local ; 2026-02-30 ; -5.00';
        const outcome = parseTxtLine(linhaMultiplosErros, 8);

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
          expect(outcome.errors.length).toBeGreaterThanOrEqual(4);
          expect(outcome.errors.some((e) => e.field === 'latitude')).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'longitude')).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'data_criacao')).toBe(true);
          expect(outcome.errors.some((e) => e.field === 'vazao_media')).toBe(true);
        }
      });
    });
  });

  describe('6. Diagnóstico Global do Arquivo e Critério canConfirm (parseNascentesTxt)', () => {
    it('deve aprovar e permitir confirmação para arquivo 100% válido', () => {
      const conteudo = [
        CABECALHO_VALIDO,
        LINHA_VALIDA_CRATO,
        LINHA_VALIDA_BARBALHA,
      ].join('\n');

      const resultado = parseNascentesTxt(conteudo);

      expect(resultado.headerValid).toBe(true);
      expect(resultado.canConfirm).toBe(true);
      expect(resultado.summary.totalLinhas).toBe(2);
      expect(resultado.summary.totalValidas).toBe(2);
      expect(resultado.summary.totalInvalidas).toBe(0);
      expect(resultado.summary.totalDuplicadas).toBe(0);
      expect(resultado.allErrors).toHaveLength(0);
    });

    it('deve bloquear confirmação se houver qualquer linha inválida', () => {
      const conteudoComErro = [
        CABECALHO_VALIDO,
        LINHA_VALIDA_CRATO,
        '-7.234567;-39.345678;Crato;Fonte Erro;Local;2026-01-01;-10', // vazão negativa
      ].join('\n');

      const resultado = parseNascentesTxt(conteudoComErro);

      expect(resultado.headerValid).toBe(true);
      expect(resultado.canConfirm).toBe(false);
      expect(resultado.summary.totalLinhas).toBe(2);
      expect(resultado.summary.totalValidas).toBe(1);
      expect(resultado.summary.totalInvalidas).toBe(1);
      expect(resultado.invalidRows).toHaveLength(1);
      expect(resultado.invalidRows[0]?.line).toBe(3);
    });

    it('deve bloquear confirmação se o arquivo estiver completamente vazio', () => {
      const resultado = parseNascentesTxt('   \n\n   ');

      expect(resultado.headerValid).toBe(false);
      expect(resultado.canConfirm).toBe(false);
      expect(resultado.summary.totalInvalidas).toBe(1);
      expect(resultado.allErrors[0]?.code).toBe(IMPORT_ERROR_CODES.EMPTY_FILE);
    });

    it('deve bloquear confirmação (canConfirm: false) se o arquivo contiver apenas o cabeçalho e nenhuma linha de dados', () => {
      const resultado = parseNascentesTxt(`${CABECALHO_VALIDO}\n\n   `);

      expect(resultado.headerValid).toBe(true);
      expect(resultado.canConfirm).toBe(false);
      expect(resultado.summary.totalValidas).toBe(0);
      expect(resultado.summary.totalInvalidas).toBe(1);
      expect(resultado.allErrors[0]?.code).toBe(IMPORT_ERROR_CODES.EMPTY_FILE);
    });

    it('deve bloquear confirmação (canConfirm: false) quando 100% das linhas forem duplicadas (totalValidas: 0)', () => {
      const chaveExistente = buildNascenteDuplicateKey(-7.234567, -39.345678, 'Nascente do Sítio Fundão');
      const conteudo = [CABECALHO_VALIDO, LINHA_VALIDA_CRATO].join('\n');

      const resultado = parseNascentesTxt(conteudo, {
        existingKeys: new Set([chaveExistente]),
      });

      expect(resultado.headerValid).toBe(true);
      expect(resultado.canConfirm).toBe(false);
      expect(resultado.summary.totalLinhas).toBe(1);
      expect(resultado.summary.totalValidas).toBe(0);
      expect(resultado.summary.totalDuplicadas).toBe(1);
      expect(resultado.summary.totalInvalidas).toBe(0);
      expect(resultado.duplicateRows[0]?.reason).toBe(DUPLICATE_REASONS.DATABASE);
    });
  });
});

