import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  municipiosPublicMetaContractSchema,
  municipiosPublicResponseContractSchema,
  parseMunicipiosPublicResponse,
} from '@/modules/municipios/municipios.schema';

describe('Módulo Municípios: Validação de Contrato de Resposta Pública', () => {
  const validResponse = {
    data: ['Barbalha', 'Crato', 'Juazeiro do Norte', 'Missão Velha'],
    meta: {
      total: 4,
    },
  };

  describe('municipiosPublicMetaContractSchema', () => {
    it('deve validar metadados com total inteiro maior ou igual a zero', () => {
      expect(municipiosPublicMetaContractSchema.parse({ total: 0 })).toEqual({ total: 0 });
      expect(municipiosPublicMetaContractSchema.parse({ total: 15 })).toEqual({ total: 15 });
    });

    it('deve rejeitar total negativo ou número decimal', () => {
      expect(() => municipiosPublicMetaContractSchema.parse({ total: -1 })).toThrow(ZodError);
      expect(() => municipiosPublicMetaContractSchema.parse({ total: 3.14 })).toThrow(ZodError);
    });

    it('deve rejeitar propriedades extras nos metadados por .strict()', () => {
      expect(() =>
        municipiosPublicMetaContractSchema.parse({
          total: 4,
          unexpectedField: 'vazamento_interno',
        })
      ).toThrow(ZodError);

      try {
        municipiosPublicMetaContractSchema.parse({
          total: 4,
          unexpectedField: 'vazamento_interno',
        });
      } catch (error) {
        const zodError = error as ZodError;
        expect(zodError.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
      }
    });
  });

  describe('municipiosPublicResponseContractSchema e parseMunicipiosPublicResponse', () => {
    it('deve validar com sucesso envelope completo com lista de municípios', () => {
      const parsed = parseMunicipiosPublicResponse(validResponse);
      expect(parsed.data).toHaveLength(4);
      expect(parsed.meta.total).toBe(4);
      expect(parsed.data).toContain('Crato');

      const schemaParsed = municipiosPublicResponseContractSchema.parse(validResponse);
      expect(schemaParsed.data).toHaveLength(4);
      expect(schemaParsed.meta.total).toBe(4);
    });

    it('deve aceitar lista vazia quando o banco não tiver nascentes ativas', () => {
      const emptyPayload = { data: [], meta: { total: 0 } };
      const parsed = parseMunicipiosPublicResponse(emptyPayload);
      expect(parsed.data).toEqual([]);
      expect(parsed.meta.total).toBe(0);
    });

    it('deve rejeitar itens que não sejam strings ou que sejam strings vazias', () => {
      expect(() =>
        parseMunicipiosPublicResponse({
          data: ['Crato', 123],
          meta: { total: 2 },
        })
      ).toThrow(ZodError);

      expect(() =>
        parseMunicipiosPublicResponse({
          data: ['Crato', '   '],
          meta: { total: 2 },
        })
      ).toThrow(ZodError);
    });

    it('deve rejeitar propriedades adicionais na raiz do envelope por .strict()', () => {
      const contaminated = {
        ...validResponse,
        usuarioId: 1,
        passwordHash: 'secret_hash',
      };

      expect(() => parseMunicipiosPublicResponse(contaminated)).toThrow(ZodError);

      try {
        parseMunicipiosPublicResponse(contaminated);
      } catch (error) {
        const zodError = error as ZodError;
        expect(zodError.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
      }
    });

    it('deve rejeitar nomes de municípios que excedam 150 caracteres', () => {
      const municipioGigante = 'X'.repeat(151);
      expect(() =>
        parseMunicipiosPublicResponse({
          data: [municipioGigante],
          meta: { total: 1 },
        })
      ).toThrow(ZodError);
    });
  });
});
