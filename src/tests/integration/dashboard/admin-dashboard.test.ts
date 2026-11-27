/**
 * Nascentes do Cariri — Teste de Integração Backend (MySQL Real)
 *
 * US-16 / Task-31 (#13) — Resumo Operacional do Painel Administrativo (`GET /api/admin/resumo`)
 *
 * Cobertura contra MySQL real (isolado por registros marcados, preservando dados existentes):
 * - Bloqueio 401 (sem sessão / sessão revogada) e 403 (conta inativa) com cabeçalhos `no-store`;
 * - Contagem estrita de `nascentes` com `ativo = true` (excluindo registros `ativo = false`);
 * - Ordenação determinística `(createdAt DESC, id DESC)` com tie-breaker e teto de 5 itens recentes;
 * - Igualdade `ultimaImportacao.id === historicoRecente[0].id` e validação Zod `.strict()`;
 * - Omissão estrita de `caminhoPrivadoArquivo`, `hashArquivo`, `mensagemErro`, `passwordHash`,
 *   `tokenHash` e `usuario.email` no payload JSON;
 * - Resposta `405 Method Not Allowed` com `Allow: GET` e `no-store`.
 */

import 'dotenv/config';
import { NextRequest } from 'next/server';
import { StatusImportacao } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { prisma } from '@/lib/db/prisma';
import { authService } from '@/modules/auth';
import {
  ADMIN_RECENT_IMPORTACOES_LIMIT,
  adminResumoResponseSchema,
  type AdminResumoResponseDto,
} from '@/modules/painel';
import { GET as resumoGET, POST as resumoPOST } from '@/app/api/admin/resumo/route';

describe('US-16 / Task-31 — Integração MySQL: GET /api/admin/resumo', () => {
  const uniqueTag = `DASH_${Date.now()}`;
  const activePasswordHash = `$2b$12$qa_dash_active_secret_${uniqueTag}`;
  const inactivePasswordHash = `$2b$12$qa_dash_inactive_secret_${uniqueTag}`;

  const createdImportacaoIds: number[] = [];
  const createdNascenteIds: number[] = [];
  const createdUserIds: number[] = [];

  let activeAdmin: { id: number; nome: string; email: string };
  let inactiveAdmin: { id: number; nome: string; email: string };
  let activeSessionToken: string;
  let inactiveSessionToken: string;

  beforeAll(async () => {
    activeAdmin = await prisma.usuario.create({
      data: {
        nome: 'Admin Painel Ativo QA',
        email: `qa_dash_active_${uniqueTag}@ufca.edu.br`,
        passwordHash: activePasswordHash,
        ativo: true,
      },
      select: { id: true, nome: true, email: true },
    });
    createdUserIds.push(activeAdmin.id);

    inactiveAdmin = await prisma.usuario.create({
      data: {
        nome: 'Admin Painel Inativo QA',
        email: `qa_dash_inactive_${uniqueTag}@ufca.edu.br`,
        passwordHash: inactivePasswordHash,
        ativo: false,
      },
      select: { id: true, nome: true, email: true },
    });
    createdUserIds.push(inactiveAdmin.id);

    const activeSession = await authService.createPersistedSession({
      userId: activeAdmin.id,
      email: activeAdmin.email,
      role: 'ADMIN',
      ttlSeconds: 3600,
    });
    activeSessionToken = activeSession.token;

    const inactiveSession = await authService.createPersistedSession({
      userId: inactiveAdmin.id,
      email: inactiveAdmin.email,
      role: 'ADMIN',
      ttlSeconds: 3600,
    });
    inactiveSessionToken = inactiveSession.token;
  });

  afterAll(async () => {
    if (createdNascenteIds.length > 0) {
      await prisma.nascente.deleteMany({
        where: { id: { in: createdNascenteIds } },
      });
    }
    if (createdImportacaoIds.length > 0) {
      await prisma.importacao.deleteMany({
        where: { id: { in: createdImportacaoIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.usuario.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  it('deve bloquear 401 (sem sessão ou revogada), 403 (conta inativa) e 405 (POST) com no-store', async () => {
    const unauthRes = await resumoGET(
      new NextRequest('http://localhost:3000/api/admin/resumo')
    );
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get('cache-control')).toContain('no-store');
    expect(unauthRes.headers.get('pragma')).toBe('no-cache');

    const inactiveRes = await resumoGET(
      new NextRequest('http://localhost:3000/api/admin/resumo', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${inactiveSessionToken}`,
        },
      })
    );
    expect(inactiveRes.status).toBe(403);
    expect(inactiveRes.headers.get('cache-control')).toContain('no-store');

    const tempSession = await authService.createPersistedSession({
      userId: activeAdmin.id,
      email: activeAdmin.email,
      role: 'ADMIN',
      ttlSeconds: 3600,
    });
    await authService.revokeSessionByToken(tempSession.token);

    const revokedRes = await resumoGET(
      new NextRequest('http://localhost:3000/api/admin/resumo', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${tempSession.token}`,
        },
      })
    );
    expect(revokedRes.status).toBe(401);
    expect(revokedRes.headers.get('cache-control')).toContain('no-store');

    const postRes = await resumoPOST();
    expect(postRes.status).toBe(405);
    expect(postRes.headers.get('allow')).toBe('GET');
    expect(postRes.headers.get('cache-control')).toContain('no-store');
  });

  it('deve contar somente nascentes ativas, limitar a 5 lotes recentes com ordenação (createdAt DESC, id DESC) e não vazar dados internos', async () => {
    const [baselineActiveSprings, baselineTotalImportacoes] = await Promise.all([
      prisma.nascente.count({ where: { ativo: true } }),
      prisma.importacao.count(),
    ]);

    // Cria 6 lotes com datas futuras controladas (2099), incluindo empate de timestamp nos 2 mais recentes
    const baseDates = [
      new Date('2099-07-01T10:00:00.000Z'), // #1 mais antigo do grupo QA (ficará fora do top 5)
      new Date('2099-07-01T11:00:00.000Z'), // #2
      new Date('2099-07-01T12:00:00.000Z'), // #3
      new Date('2099-07-01T13:00:00.000Z'), // #4
      new Date('2099-07-01T14:00:00.000Z'), // #5 (empate com #6 -> menor id)
      new Date('2099-07-01T14:00:00.000Z'), // #6 (empate com #5 -> maior id -> deve ser ultimaImportacao!)
    ];

    const secretPrivatePaths: string[] = [];
    const secretErrorMessages: string[] = [];
    const secretFileHashes: string[] = [];

    for (let index = 0; index < baseDates.length; index++) {
      const createdAt = baseDates[index];
      if (!createdAt) {
        continue;
      }

      const privatePath = `private/importacoes/qa/${uniqueTag}-batch-${index}.txt`;
      const rawError = `RAW_INTERNAL_ERR_${uniqueTag}_${index}`;
      const fileHash = `${index}`.repeat(64);

      secretPrivatePaths.push(privatePath);
      secretErrorMessages.push(rawError);
      secretFileHashes.push(fileHash);

      const created = await prisma.importacao.create({
        data: {
          usuarioId: activeAdmin.id,
          nomeArquivo: `${uniqueTag}-lote-${index + 1}.txt`,
          caminhoPrivadoArquivo: privatePath,
          hashArquivo: fileHash,
          totalLinhas: 10 + index,
          totalValidas: index === 5 ? 0 : 8 + index,
          totalInvalidas: index === 5 ? 10 + index : 1,
          totalDuplicadas: index === 5 ? 0 : 1,
          status: index === 5 ? StatusImportacao.FALHOU : StatusImportacao.CONCLUIDA,
          mensagemErro: index === 5 ? rawError : null,
          createdAt,
          concluidaAt: createdAt,
        },
        select: { id: true },
      });
      createdImportacaoIds.push(created.id);
    }

    const referenceImportacaoId = createdImportacaoIds[0];
    if (referenceImportacaoId === undefined) {
      throw new Error('Falha ao criar lote de referência para teste de integração.');
    }

    // Cria 3 nascentes ATIVAS e 2 nascentes INATIVAS (ativo: false) no Cariri
    const baseLat = -7.21;
    const baseLon = -39.31;
    const seedSuffix = (Date.now() % 10000) / 1_000_000;

    for (let i = 0; i < 5; i++) {
      const isAtivo = i < 3;
      const nascente = await prisma.nascente.create({
        data: {
          latitude: baseLat - seedSuffix - i * 0.0001,
          longitude: baseLon - seedSuffix - i * 0.0001,
          municipio: 'Crato',
          fonte: `${uniqueTag}_Fonte_${i}`,
          localidade: 'Sítio QA Integração',
          dataCriacao: new Date('2026-08-01T00:00:00.000Z'),
          vazaoMedia: 2.5,
          ativo: isAtivo,
          importacaoId: referenceImportacaoId,
        },
        select: { id: true },
      });
      createdNascenteIds.push(nascente.id);
    }

    const response = await resumoGET(
      new NextRequest('http://localhost:3000/api/admin/resumo', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${activeSessionToken}`,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'no-store, no-cache, must-revalidate, private'
    );
    expect(response.headers.get('pragma')).toBe('no-cache');

    const rawText = await response.text();
    const body = JSON.parse(rawText) as AdminResumoResponseDto;

    // Conformidade estrita com o schema Zod v4 (.strict())
    expect(adminResumoResponseSchema.safeParse(body).success).toBe(true);

    // Contagem exata: somente as 3 nascentes ativas somadas ao baseline (as 2 inativas são ignoradas)
    expect(body.indicadores.totalNascentesAtivas).toBe(baselineActiveSprings + 3);
    expect(body.indicadores.totalImportacoes).toBe(baselineTotalImportacoes + 6);

    // Teto estrito de 5 lotes recentes e tie-breaker determinístico (createdAt DESC, id DESC)
    expect(body.meta.recentLimit).toBe(ADMIN_RECENT_IMPORTACOES_LIMIT);
    expect(body.historicoRecente).toHaveLength(ADMIN_RECENT_IMPORTACOES_LIMIT);

    const expectedTop5Ids = createdImportacaoIds.slice(1).reverse();
    expect(body.historicoRecente.map((item) => item.id)).toEqual(expectedTop5Ids);

    // ultimaImportacao espelha o lote mais recente (mesmo com status FALHOU)
    expect(body.indicadores.ultimaImportacao).toEqual(body.historicoRecente[0]);
    expect(body.indicadores.ultimaImportacao?.id).toBe(createdImportacaoIds[5]);
    expect(body.indicadores.ultimaImportacao?.status).toBe('FALHOU');

    // Blindagem absoluta contra vazamento de dados internos/PII
    expect(rawText).not.toContain('caminhoPrivadoArquivo');
    expect(rawText).not.toContain('caminho_privado_arquivo');
    expect(rawText).not.toContain('hashArquivo');
    expect(rawText).not.toContain('hashSha256');
    expect(rawText).not.toContain('mensagemErro');
    expect(rawText).not.toContain('passwordHash');
    expect(rawText).not.toContain('tokenHash');
    expect(rawText).not.toContain(activePasswordHash);
    expect(rawText).not.toContain(activeAdmin.email);

    for (const secretPath of secretPrivatePaths) {
      expect(rawText).not.toContain(secretPath);
    }
    for (const secretErr of secretErrorMessages) {
      expect(rawText).not.toContain(secretErr);
    }
    for (const secretHash of secretFileHashes) {
      expect(rawText).not.toContain(secretHash);
    }
  });
});
