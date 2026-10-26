import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  parseNascentesQueryParams,
  nascentePublicItemContractSchema,
  nascentesPublicMetaContractSchema,
  nascentesPublicResponseContractSchema,
  parseNascentesPublicResponse,
} from '@/modules/nascentes/nascentes.schema';

describe('Módulo Nascentes: Validação de Query Params', () => {
  describe('Cenários Válidos', () => {
    it('deve aceitar objeto vazio e normalizar todos os campos para undefined', () => {
      const result = parseNascentesQueryParams({});

      expect(result.municipio).toBeUndefined();
      expect(result.q).toBeUndefined();
      expect(result.north).toBeUndefined();
      expect(result.south).toBeUndefined();
      expect(result.east).toBeUndefined();
      expect(result.west).toBeUndefined();
    });

    it('deve normalizar strings vazias ou com apenas espaços para undefined', () => {
      const result = parseNascentesQueryParams({
        municipio: '   ',
        q: '',
        north: '',
        south: '   ',
      });

      expect(result.municipio).toBeUndefined();
      expect(result.q).toBeUndefined();
      expect(result.north).toBeUndefined();
      expect(result.south).toBeUndefined();
      expect(result.east).toBeUndefined();
      expect(result.west).toBeUndefined();
    });

    it('deve aplicar trim em campos de texto válidos', () => {
      const result = parseNascentesQueryParams({
        municipio: '  Crato  ',
        q: '  Fonte dos Buritis  ',
      });

      expect(result.municipio).toBe('Crato');
      expect(result.q).toBe('Fonte dos Buritis');
    });

    it('deve converter e aceitar Bounding Box válido enviado como strings numéricas', () => {
      const result = parseNascentesQueryParams({
        north: '-6.500000',
        south: '-8.000000',
        east: '-38.500000',
        west: '-40.500000',
      });

      expect(result.north).toBe(-6.5);
      expect(result.south).toBe(-8.0);
      expect(result.east).toBe(-38.5);
      expect(result.west).toBe(-40.5);
    });

    it('deve aceitar Bounding Box com coordenadas numéricas idênticas (ponto singular)', () => {
      const result = parseNascentesQueryParams({
        north: -7.2,
        south: -7.2,
        east: -39.3,
        west: -39.3,
      });

      expect(result.north).toBe(-7.2);
      expect(result.south).toBe(-7.2);
      expect(result.east).toBe(-39.3);
      expect(result.west).toBe(-39.3);
    });

    it('deve aceitar combinação de filtros textuais e Bounding Box', () => {
      const result = parseNascentesQueryParams({
        municipio: 'Barbalha',
        q: 'Esperança',
        north: -7.2,
        south: -7.3,
        east: -39.3,
        west: -39.4,
      });

      expect(result.municipio).toBe('Barbalha');
      expect(result.q).toBe('Esperança');
      expect(result.north).toBe(-7.2);
      expect(result.south).toBe(-7.3);
      expect(result.east).toBe(-39.3);
      expect(result.west).toBe(-39.4);
    });
  });

  describe('Cenários Inválidos — Bounding Box e Tipos', () => {
    it('deve rejeitar Bounding Box parcial com apenas uma coordenada fornecida', () => {
      expect(() => parseNascentesQueryParams({ north: '-6.5' })).toThrow(ZodError);

      try {
        parseNascentesQueryParams({ north: '-6.5' });
      } catch (error) {
        const zodError = error as ZodError;
        expect(zodError.issues.some((i) => i.path.includes('bounds'))).toBe(true);
      }
    });

    it('deve rejeitar Bounding Box parcial com três coordenadas fornecidas', () => {
      expect(() =>
        parseNascentesQueryParams({
          north: '-6.5',
          south: '-8.0',
          east: '-38.5',
        })
      ).toThrow(ZodError);
    });

    it('deve rejeitar Bounding Box com valores não numéricos', () => {
      expect(() =>
        parseNascentesQueryParams({
          north: 'invalido',
          south: '-8.0',
          east: '-38.5',
          west: '-40.5',
        })
      ).toThrow(ZodError);
    });

    it('deve rejeitar latitudes fora dos limites mundiais [-90, 90]', () => {
      expect(() =>
        parseNascentesQueryParams({
          north: '95.0',
          south: '-8.0',
          east: '-38.5',
          west: '-40.5',
        })
      ).toThrow(ZodError);

      expect(() =>
        parseNascentesQueryParams({
          north: '-6.5',
          south: '-95.0',
          east: '-38.5',
          west: '-40.5',
        })
      ).toThrow(ZodError);
    });

    it('deve rejeitar longitudes fora dos limites mundiais [-180, 180]', () => {
      expect(() =>
        parseNascentesQueryParams({
          north: '-6.5',
          south: '-8.0',
          east: '185.0',
          west: '-40.5',
        })
      ).toThrow(ZodError);

      expect(() =>
        parseNascentesQueryParams({
          north: '-6.5',
          south: '-8.0',
          east: '-38.5',
          west: '-185.0',
        })
      ).toThrow(ZodError);
    });

    it('deve rejeitar Bounding Box com latitudes invertidas (north < south)', () => {
      expect(() =>
        parseNascentesQueryParams({
          north: -8.0,
          south: -6.5,
          east: -38.5,
          west: -40.5,
        })
      ).toThrow(ZodError);

      try {
        parseNascentesQueryParams({
          north: -8.0,
          south: -6.5,
          east: -38.5,
          west: -40.5,
        });
      } catch (error) {
        const zodError = error as ZodError;
        expect(zodError.issues.some((i) => i.path.includes('north'))).toBe(true);
      }
    });

    it('deve rejeitar Bounding Box com longitudes invertidas (east < west)', () => {
      expect(() =>
        parseNascentesQueryParams({
          north: -6.5,
          south: -8.0,
          east: -40.5,
          west: -38.5,
        })
      ).toThrow(ZodError);

      try {
        parseNascentesQueryParams({
          north: -6.5,
          south: -8.0,
          east: -40.5,
          west: -38.5,
        });
      } catch (error) {
        const zodError = error as ZodError;
        expect(zodError.issues.some((i) => i.path.includes('east'))).toBe(true);
      }
    });

    it('deve rejeitar município que exceda 150 caracteres', () => {
      const municipioLongo = 'A'.repeat(151);
      expect(() => parseNascentesQueryParams({ municipio: municipioLongo })).toThrow(ZodError);
    });

    it('deve rejeitar parâmetro de busca q que exceda 100 caracteres', () => {
      const qLongo = 'B'.repeat(101);
      expect(() => parseNascentesQueryParams({ q: qLongo })).toThrow(ZodError);
    });
  });

  describe('Contratos de Resposta Pública de Nascentes', () => {
    const validItem = {
      id: 10,
      latitude: -7.2345,
      longitude: -39.4123,
      municipio: 'Crato',
      fonte: 'Nascente do Vale',
      localidade: 'Sítio Fundão',
      data_criacao: '2026-08-01',
      vazao_media: 2.75,
      unidade_vazao: 'm³/s' as const,
    };

    const validResponse = {
      data: [validItem],
      meta: {
        total: 1,
        updated_at: '2026-10-21T09:30:00.000Z',
      },
    };

    describe('nascentePublicItemContractSchema', () => {
      it('deve validar com sucesso um item com todos os campos em conformidade', () => {
        const parsed = nascentePublicItemContractSchema.parse(validItem);
        expect(parsed).toEqual(validItem);
      });

      it('deve rejeitar e falhar por .strict() caso campos internos confidenciais sejam injetados', () => {
        const forbiddenFields = [
          { usuarioId: 1 },
          { importacaoId: 2 },
          { caminhoPrivadoArquivo: '/blobs/privado.txt' },
          { hashArquivo: 'sha256_hash_secreto' },
          { passwordHash: 'hash_secreto' },
          { createdAt: '2026-08-01T00:00:00.000Z' },
          { updatedAt: '2026-08-01T00:00:00.000Z' },
          { ativo: true },
        ];

        for (const forbidden of forbiddenFields) {
          const contaminated = { ...validItem, ...forbidden };
          expect(() => nascentePublicItemContractSchema.parse(contaminated)).toThrow(ZodError);

          try {
            nascentePublicItemContractSchema.parse(contaminated);
          } catch (error) {
            const zodError = error as ZodError;
            expect(zodError.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
          }
        }
      });

      it('deve rejeitar data_criacao fora do formato estrito AAAA-MM-DD', () => {
        const invalidDates = [
          '2026/08/01',
          '01-08-2026',
          '2026-8-1',
          '2026-08-01T00:00:00.000Z',
          'data-invalida',
          '',
        ];

        for (const data_criacao of invalidDates) {
          expect(() =>
            nascentePublicItemContractSchema.parse({
              ...validItem,
              data_criacao,
            })
          ).toThrow(ZodError);
        }
      });

      it('deve rejeitar vazao_media negativa, NaN ou não-finita', () => {
        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            vazao_media: -0.01,
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            vazao_media: Number.NaN,
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            vazao_media: Number.POSITIVE_INFINITY,
          })
        ).toThrow(ZodError);
      });

      it('deve rejeitar unidade_vazao diferente do literal m³/s', () => {
        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            unidade_vazao: 'L/s',
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            unidade_vazao: 'm3/s',
          })
        ).toThrow(ZodError);
      });

      it('deve rejeitar coordenadas fora dos limites geográficos globais', () => {
        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            latitude: 91,
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            latitude: -90.1,
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            longitude: 181,
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            longitude: -180.1,
          })
        ).toThrow(ZodError);
      });

      it('deve rejeitar id que não seja inteiro positivo', () => {
        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            id: 0,
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            id: -5,
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentePublicItemContractSchema.parse({
            ...validItem,
            id: 1.5,
          })
        ).toThrow(ZodError);
      });
    });

    describe('nascentesPublicMetaContractSchema', () => {
      it('deve aceitar total inteiro e updated_at como ISO string', () => {
        const meta = { total: 10, updated_at: '2026-10-21T09:30:00.000Z' };
        expect(nascentesPublicMetaContractSchema.parse(meta)).toEqual(meta);
      });

      it('deve aceitar updated_at como null (ex: banco sem registros)', () => {
        const meta = { total: 0, updated_at: null };
        expect(nascentesPublicMetaContractSchema.parse(meta)).toEqual(meta);
      });

      it('deve rejeitar total negativo ou número decimal', () => {
        expect(() =>
          nascentesPublicMetaContractSchema.parse({
            total: -1,
            updated_at: null,
          })
        ).toThrow(ZodError);

        expect(() =>
          nascentesPublicMetaContractSchema.parse({
            total: 2.5,
            updated_at: null,
          })
        ).toThrow(ZodError);
      });

      it('deve rejeitar campos adicionais nos metadados por .strict()', () => {
        expect(() =>
          nascentesPublicMetaContractSchema.parse({
            total: 0,
            updated_at: null,
            internalAudit: true,
          })
        ).toThrow(ZodError);
      });
    });

    describe('nascentesPublicResponseContractSchema e parseNascentesPublicResponse', () => {
      it('deve validar com sucesso envelope completo de resposta', () => {
        const parsed = parseNascentesPublicResponse(validResponse);
        expect(parsed.data).toHaveLength(1);
        expect(parsed.meta.total).toBe(1);

        const schemaParsed = nascentesPublicResponseContractSchema.parse(validResponse);
        expect(schemaParsed.data).toHaveLength(1);
        expect(schemaParsed.meta.total).toBe(1);
      });

      it('deve rejeitar propriedades extras na raiz do envelope por .strict()', () => {
        const contaminatedEnvelope = {
          ...validResponse,
          adminAccess: true,
        };

        expect(() => parseNascentesPublicResponse(contaminatedEnvelope)).toThrow(ZodError);
      });

      it('deve rejeitar se data ou meta estiverem ausentes', () => {
        expect(() => parseNascentesPublicResponse({ data: [] })).toThrow(ZodError);
        expect(() =>
          parseNascentesPublicResponse({
            meta: { total: 0, updated_at: null },
          })
        ).toThrow(ZodError);
      });
    });
  });
});
