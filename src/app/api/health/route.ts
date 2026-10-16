import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DB_TIMEOUT_MS = 3000;

export async function GET() {
  let timer: NodeJS.Timeout | undefined;

  try {
    // Valida conectividade e operabilidade do banco com timeout de proteção fail-fast
    await Promise.race([
      prisma.usuario.count(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timeout ao conectar ao banco de dados")),
          DB_TIMEOUT_MS
        );
      }),
    ]);

    if (timer) clearTimeout(timer);

    return NextResponse.json(
      {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: "healthy",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    if (timer) clearTimeout(timer);

    logger.error("Falha na verificação de saúde da aplicação", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });

    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        database: "unhealthy",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
