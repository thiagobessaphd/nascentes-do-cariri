import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMunicipiosPublicos } from '@/modules/municipios';
import { prisma } from '@/lib/db/prisma';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    nascente: {
      findMany: vi.fn(),
    },
  },
}));

describe('Unitário — Serviço de Municípios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve consultar o Prisma filtrando exclusivamente por ativo: true e distinct no campo municipio', async () => {
    vi.mocked(prisma.nascente.findMany).mockResolvedValueOnce([
      { municipio: 'Crato' },
      { municipio: 'Barbalha' },
    ] as unknown as Awaited<ReturnType<typeof prisma.nascente.findMany>>);

    const result = await getMunicipiosPublicos();

    expect(prisma.nascente.findMany).toHaveBeenCalledWith({
      where: {
        ativo: true,
      },
      select: {
        municipio: true,
      },
      distinct: ['municipio'],
      orderBy: {
        municipio: 'asc',
      },
    });

    expect(result.data).toEqual(['Barbalha', 'Crato']);
    expect(result.meta.total).toBe(2);
  });

  it('deve realizar trim de espaços e remover duplicatas resultantes da higienização', async () => {
    vi.mocked(prisma.nascente.findMany).mockResolvedValueOnce([
      { municipio: '  Crato ' },
      { municipio: 'Crato' },
      { municipio: ' Barbalha  ' },
    ] as unknown as Awaited<ReturnType<typeof prisma.nascente.findMany>>);

    const result = await getMunicipiosPublicos();

    expect(result.data).toEqual(['Barbalha', 'Crato']);
    expect(result.meta.total).toBe(2);
  });

  it('deve descartar strings vazias ou compostas apenas por espaços', async () => {
    vi.mocked(prisma.nascente.findMany).mockResolvedValueOnce([
      { municipio: '' },
      { municipio: '   ' },
      { municipio: 'Juazeiro do Norte' },
    ] as unknown as Awaited<ReturnType<typeof prisma.nascente.findMany>>);

    const result = await getMunicipiosPublicos();

    expect(result.data).toEqual(['Juazeiro do Norte']);
    expect(result.meta.total).toBe(1);
  });

  it('deve ordenar alfabeticamente considerando acentos em português', async () => {
    vi.mocked(prisma.nascente.findMany).mockResolvedValueOnce([
      { municipio: 'Missão Velha' },
      { municipio: 'Barbalha' },
      { municipio: 'Abaiara' },
      { municipio: 'Crato' },
      { municipio: 'Águas Belas' },
    ] as unknown as Awaited<ReturnType<typeof prisma.nascente.findMany>>);

    const result = await getMunicipiosPublicos();

    // Verificação de ordenação alfabética com sensitivity base pt-BR
    const expected = ['Abaiara', 'Águas Belas', 'Barbalha', 'Crato', 'Missão Velha'].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );

    expect(result.data).toEqual(expected);
    expect(result.meta.total).toBe(5);
  });

  it('deve retornar lista vazia e total 0 quando o banco não tiver registros', async () => {
    vi.mocked(prisma.nascente.findMany).mockResolvedValueOnce([]);

    const result = await getMunicipiosPublicos();

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });
});
