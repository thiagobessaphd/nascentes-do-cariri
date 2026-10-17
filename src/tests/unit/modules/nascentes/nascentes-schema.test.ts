import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { parseNascentesQueryParams } from '@/modules/nascentes/nascentes.schema';

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
});
