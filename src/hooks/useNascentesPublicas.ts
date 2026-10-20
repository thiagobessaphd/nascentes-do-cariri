'use client';

/**
 * Nascentes do Cariri — Hook de Consulta Pública de Nascentes
 * Gerencia ciclo de vida, estados assíncronos (loading, error, empty, success),
 * cancelamento via AbortController e função de retry.
*/

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NascentePublicDto, NascentesQueryParams } from '@/modules/nascentes/nascentes.dto';
import { fetchNascentesPublicas, NascentesClientError } from '@/services/nascentes.client';

export type NascentesStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface UseNascentesPublicasResult {
  readonly status: NascentesStatus;
  readonly data: readonly NascentePublicDto[];
  readonly total: number;
  readonly updatedAt: string | null;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isEmpty: boolean;
  readonly isSuccess: boolean;
  readonly refetch: () => Promise<void>;
}

export function useNascentesPublicas(params?: NascentesQueryParams): UseNascentesPublicasResult {
  const [status, setStatus] = useState<NascentesStatus>('loading');
  const [data, setData] = useState<readonly NascentePublicDto[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  // Armazena a referência do AbortController ativo para cancelamento simétrico
  const abortControllerRef = useRef<AbortController | null>(null);

  // Serializa parâmetros para evitar re-execuções desnecessárias por igualdade referencial de objetos
  const serializedParams = JSON.stringify(params ?? {});
  const [prevParams, setPrevParams] = useState<string>(serializedParams);

  // Ajusta estado durante a fase de render caso os parâmetros de busca mudem
  if (prevParams !== serializedParams) {
    setPrevParams(serializedParams);
    setStatus('loading');
    setError(null);
  }

  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setReloadToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // Cancela requisição anterior se ainda estiver em andamento
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function execute() {
      try {
        const parsedParams: NascentesQueryParams = JSON.parse(serializedParams) as NascentesQueryParams;
        const response = await fetchNascentesPublicas({
          params: parsedParams,
          signal: controller.signal,
        });

        setData(response.data);
        setTotal(response.meta.total);
        setUpdatedAt(response.meta.updated_at);

        if (response.data.length === 0) {
          setStatus('empty');
        } else {
          setStatus('success');
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Ignora aborts esperados decorrentes de desmontagem ou novas buscas
          return;
        }

        let userFriendlyMessage = 'Não foi possível carregar as nascentes no momento. Tente novamente mais tarde.';

        if (err instanceof NascentesClientError) {
          if (err.isNetworkError) {
            userFriendlyMessage = 'Dificuldade de conexão com o servidor. Verifique sua internet.';
          } else if (err.statusCode === 400) {
            userFriendlyMessage = 'Os filtros de busca informados são inválidos. Por favor, revise sua pesquisa.';
          }
        }

        setError(userFriendlyMessage);
        setStatus('error');
      }
    }

    void execute();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [serializedParams, reloadToken]);

  return {
    status,
    data,
    total,
    updatedAt,
    error,
    isLoading: status === 'loading',
    isError: status === 'error',
    isEmpty: status === 'empty',
    isSuccess: status === 'success',
    refetch,
  };
}
