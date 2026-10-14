import { describe, it, expect } from 'vitest';
import {
  CARIRI_BOUNDS,
  isWithinCaririBounds,
  validateNascente,
  nascenteDomainSchema,
} from '../../../lib/domain/nascente';

describe('Validações de Domínio de Nascentes (Seção 16)', () => {
  const nascenteValidaBase = {
    latitude: -7.234567,
    longitude: -39.345678,
    municipio: 'Crato',
    fonte: 'Nascente do Sítio Fundão',
    localidade: 'Floresta Nacional do Araripe',
    dataCriacao: '2026-01-10',
    vazaoMedia: 2.75,
  };

  describe('Caminho Feliz', () => {
    it('deve aprovar um registro de nascente válido com todos os dados corretos no Cariri', () => {
      const result = validateNascente(nascenteValidaBase);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.municipio).toBe('Crato');
      expect(result.data?.latitude).toBe(-7.234567);
      expect(result.data?.longitude).toBe(-39.345678);
      expect(result.data?.vazaoMedia).toBe(2.75);
      expect(result.data?.dataCriacao).toBeInstanceOf(Date);
      expect(result.errors).toBeUndefined();
    });

    it('deve permitir vazão média igual a zero (nascente temporariamente seca)', () => {
      const result = validateNascente({
        ...nascenteValidaBase,
        vazaoMedia: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.vazaoMedia).toBe(0);
    });

    it('deve realizar coerção correta de strings numéricas e aparar espaços em branco', () => {
      const result = validateNascente({
        ...nascenteValidaBase,
        latitude: '-7.234567',
        longitude: '-39.345678',
        vazaoMedia: '1.85',
        municipio: '   Juazeiro do Norte   ',
        fonte: '   Fonte dos Romeiros   ',
        localidade: '   Horto   ',
      });

      expect(result.success).toBe(true);
      expect(result.data?.municipio).toBe('Juazeiro do Norte');
      expect(result.data?.fonte).toBe('Fonte dos Romeiros');
      expect(result.data?.localidade).toBe('Horto');
      expect(result.data?.latitude).toBe(-7.234567);
      expect(result.data?.vazaoMedia).toBe(1.85);
    });
  });

  describe('CT-BE-07: Coordenada fora dos limites', () => {
    it('deve rejeitar latitude fora do globo terrestre (> 90 ou < -90)', () => {
      const resultMaior90 = validateNascente({
        ...nascenteValidaBase,
        latitude: 95.0,
      });
      expect(resultMaior90.success).toBe(false);
      expect(resultMaior90.errors?.latitude).toBeDefined();

      const resultMenor90 = validateNascente({
        ...nascenteValidaBase,
        latitude: -95.0,
      });
      expect(resultMenor90.success).toBe(false);
      expect(resultMenor90.errors?.latitude).toBeDefined();
    });

    it('deve rejeitar longitude fora do globo terrestre (> 180 ou < -180)', () => {
      const resultMaior180 = validateNascente({
        ...nascenteValidaBase,
        longitude: 185.0,
      });
      expect(resultMaior180.success).toBe(false);
      expect(resultMaior180.errors?.longitude).toBeDefined();

      const resultMenor180 = validateNascente({
        ...nascenteValidaBase,
        longitude: -185.0,
      });
      expect(resultMenor180.success).toBe(false);
      expect(resultMenor180.errors?.longitude).toBeDefined();
    });

    it('deve rejeitar coordenadas válidas globalmente mas fora do bounding box do Cariri', () => {
      // Coordenadas de Fortaleza (-3.7319, -38.5267) — fora dos limites do Cariri
      const resultFortaleza = validateNascente({
        ...nascenteValidaBase,
        latitude: -3.7319,
        longitude: -38.5267,
      });
      expect(resultFortaleza.success).toBe(false);
      expect(resultFortaleza.errors?.latitude).toContain('fora dos limites do Cariri');

      // Coordenadas de São Paulo (-23.5505, -46.6333) — fora dos limites do Cariri
      const resultSP = validateNascente({
        ...nascenteValidaBase,
        latitude: -23.5505,
        longitude: -46.6333,
      });
      expect(resultSP.success).toBe(false);
      expect(resultSP.errors?.latitude).toContain('fora dos limites do Cariri');
    });

    it('deve aceitar coordenadas exatamente nos limites de fronteira do Cariri', () => {
      const bordaMin = validateNascente({
        ...nascenteValidaBase,
        latitude: CARIRI_BOUNDS.MIN_LAT,
        longitude: CARIRI_BOUNDS.MIN_LNG,
      });
      expect(bordaMin.success).toBe(true);

      const bordaMax = validateNascente({
        ...nascenteValidaBase,
        latitude: CARIRI_BOUNDS.MAX_LAT,
        longitude: CARIRI_BOUNDS.MAX_LNG,
      });
      expect(bordaMax.success).toBe(true);
    });

    it('deve rejeitar coordenadas não numéricas ou NaN', () => {
      const resultLetras = validateNascente({
        ...nascenteValidaBase,
        latitude: 'coordenada_invalida',
      });
      expect(resultLetras.success).toBe(false);
      expect(resultLetras.errors?.latitude).toBeDefined();

      const resultNaN = validateNascente({
        ...nascenteValidaBase,
        longitude: NaN,
      });
      expect(resultNaN.success).toBe(false);
      expect(resultNaN.errors?.longitude).toBeDefined();
    });

    it('deve validar corretamente a função utilitária isWithinCaririBounds', () => {
      expect(isWithinCaririBounds(-7.23, -39.34)).toBe(true); // Crato
      expect(isWithinCaririBounds(-7.20, -39.31)).toBe(true); // Juazeiro
      expect(isWithinCaririBounds(-7.31, -39.30)).toBe(true); // Barbalha

      expect(isWithinCaririBounds(-3.73, -38.52)).toBe(false); // Fortaleza (fora)
      expect(isWithinCaririBounds(-8.50, -39.30)).toBe(false); // Muito ao sul
      expect(isWithinCaririBounds(-6.00, -39.30)).toBe(false); // Muito ao norte
      expect(isWithinCaririBounds(NaN, -39.30)).toBe(false);
      expect(isWithinCaririBounds(-7.23, NaN)).toBe(false);
    });
  });

  describe('CT-BE-08: Data inválida', () => {
    it('deve rejeitar texto não reconhecível como data', () => {
      const result = validateNascente({
        ...nascenteValidaBase,
        dataCriacao: 'data_corrompida',
      });

      expect(result.success).toBe(false);
      expect(result.errors?.dataCriacao).toBeDefined();
    });

    it('deve rejeitar data futura', () => {
      const dataFutura = new Date();
      dataFutura.setFullYear(dataFutura.getFullYear() + 2);

      const result = validateNascente({
        ...nascenteValidaBase,
        dataCriacao: dataFutura.toISOString().slice(0, 10),
      });

      expect(result.success).toBe(false);
      expect(result.errors?.dataCriacao).toContain('não pode ser futura');
    });

    it('deve aceitar instâncias de Date nativas', () => {
      const result = validateNascente({
        ...nascenteValidaBase,
        dataCriacao: new Date('2025-05-15T00:00:00.000Z'),
      });

      expect(result.success).toBe(true);
      expect(result.data?.dataCriacao).toBeInstanceOf(Date);
    });
  });

  describe('CT-BE-09: Vazão negativa ou não numérica', () => {
    it('deve rejeitar vazão negativa', () => {
      const resultNegativa = validateNascente({
        ...nascenteValidaBase,
        vazaoMedia: -0.01,
      });

      expect(resultNegativa.success).toBe(false);
      expect(resultNegativa.errors?.vazaoMedia).toContain('maior ou igual a zero');

      const resultNegativaGrande = validateNascente({
        ...nascenteValidaBase,
        vazaoMedia: -100,
      });

      expect(resultNegativaGrande.success).toBe(false);
      expect(resultNegativaGrande.errors?.vazaoMedia).toContain('maior ou igual a zero');
    });

    it('deve rejeitar vazão não numérica ou NaN', () => {
      const resultTexto = validateNascente({
        ...nascenteValidaBase,
        vazaoMedia: 'cinco_litros',
      });

      expect(resultTexto.success).toBe(false);
      expect(resultTexto.errors?.vazaoMedia).toBeDefined();

      const resultNaN = validateNascente({
        ...nascenteValidaBase,
        vazaoMedia: NaN,
      });

      expect(resultNaN.success).toBe(false);
      expect(resultNaN.errors?.vazaoMedia).toBeDefined();
    });
  });

  describe('CT-BE-10: Campo obrigatório vazio', () => {
    it('deve rejeitar município vazio ou contendo apenas espaços', () => {
      const resultVazio = validateNascente({
        ...nascenteValidaBase,
        municipio: '',
      });
      expect(resultVazio.success).toBe(false);
      expect(resultVazio.errors?.municipio).toBeDefined();

      const resultEspacos = validateNascente({
        ...nascenteValidaBase,
        municipio: '    ',
      });
      expect(resultEspacos.success).toBe(false);
      expect(resultEspacos.errors?.municipio).toBeDefined();
    });

    it('deve rejeitar município que exceda 150 caracteres', () => {
      const resultExcesso = validateNascente({
        ...nascenteValidaBase,
        municipio: 'A'.repeat(151),
      });

      expect(resultExcesso.success).toBe(false);
      expect(resultExcesso.errors?.municipio).toContain('máximo 150');
    });

    it('deve rejeitar fonte vazia ou contendo apenas espaços', () => {
      const resultVazio = validateNascente({
        ...nascenteValidaBase,
        fonte: '',
      });
      expect(resultVazio.success).toBe(false);
      expect(resultVazio.errors?.fonte).toBeDefined();

      const resultEspacos = validateNascente({
        ...nascenteValidaBase,
        fonte: '    ',
      });
      expect(resultEspacos.success).toBe(false);
      expect(resultEspacos.errors?.fonte).toBeDefined();
    });

    it('deve rejeitar fonte que exceda 255 caracteres', () => {
      const resultExcesso = validateNascente({
        ...nascenteValidaBase,
        fonte: 'F'.repeat(256),
      });

      expect(resultExcesso.success).toBe(false);
      expect(resultExcesso.errors?.fonte).toContain('máximo 255');
    });

    it('deve rejeitar localidade vazia ou contendo apenas espaços', () => {
      const resultVazio = validateNascente({
        ...nascenteValidaBase,
        localidade: '',
      });
      expect(resultVazio.success).toBe(false);
      expect(resultVazio.errors?.localidade).toBeDefined();

      const resultEspacos = validateNascente({
        ...nascenteValidaBase,
        localidade: '    ',
      });
      expect(resultEspacos.success).toBe(false);
      expect(resultEspacos.errors?.localidade).toBeDefined();
    });

    it('deve rejeitar quando campos obrigatórios são omitidos (undefined ou null)', () => {
      const semLatitude = { ...nascenteValidaBase };
      delete (semLatitude as Record<string, unknown>).latitude;
      expect(validateNascente(semLatitude).success).toBe(false);

      const semLongitude = { ...nascenteValidaBase };
      delete (semLongitude as Record<string, unknown>).longitude;
      expect(validateNascente(semLongitude).success).toBe(false);

      const semMunicipio = { ...nascenteValidaBase };
      delete (semMunicipio as Record<string, unknown>).municipio;
      expect(validateNascente(semMunicipio).success).toBe(false);

      const semFonte = { ...nascenteValidaBase };
      delete (semFonte as Record<string, unknown>).fonte;
      expect(validateNascente(semFonte).success).toBe(false);

      const semLocalidade = { ...nascenteValidaBase };
      delete (semLocalidade as Record<string, unknown>).localidade;
      expect(validateNascente(semLocalidade).success).toBe(false);

      const semData = { ...nascenteValidaBase };
      delete (semData as Record<string, unknown>).dataCriacao;
      expect(validateNascente(semData).success).toBe(false);

      const semVazao = { ...nascenteValidaBase };
      delete (semVazao as Record<string, unknown>).vazaoMedia;
      expect(validateNascente(semVazao).success).toBe(false);
    });
  });
});
