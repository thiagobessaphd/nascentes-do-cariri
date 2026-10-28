'use client';

/**
 * Nascentes do Cariri — Hook de Consulta Pública de Municípios
 * Gerencia ciclo de vida, estados assíncronos (loading, error, empty, success),
 * cancelamento simétrico via AbortController e função de retry para o filtro de municípios.
 */

import { useEffect, useRef, useState } from 'react';
import { fetchMunicipiosPublicos, MunicipiosClientError } from '@/services/municipios.client';

export type MunicipiosStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface UseMunicipiosPublicosResult {
  readonly status: MunicipiosStatus;
  readonly data: readonly string[];
  readonly total: number;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isEmpty: boolean;
  readonly isSuccess: boolean;
  readonly refetch: () => Promise<void>;
}

export function useMunicipiosPublicos(): UseMunicipiosPublicosResult {
  const [status, setStatus] = useState<MunicipiosStatus>('loading');
  const [data, setData] = useState<readonly string[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  // Armazena a referência do AbortController ativo para cancelamento simétrico
  const abortControllerRef = useRef<AbortController | null>(null);

  const refetch = async (): Promise<void> => {
    setStatus('loading');
    setError(null);
    setReloadToken((prev) => prev + 1);
  };

  useEffect(() => {
    // Cancela requisição anterior se ainda estiver em andamento
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function execute() {
      try {
        const response = await fetchMunicipiosPublicos({
          signal: controller.signal,
        });

        setData(response.data);
        setTotal(response.meta.total);

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

        let userFriendlyMessage =
          'Não foi possível carregar a lista de municípios no momento.';

        if (err instanceof MunicipiosClientError && err.isNetworkError) {
          userFriendlyMessage =
            'Dificuldade de conexão com o servidor. Verifique sua internet.';
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
  }, [reloadToken]);

  return {
    status,
    data,
    total,
    error,
    isLoading: status === 'loading',
    isError: status === 'error',
    isEmpty: status === 'empty',
    isSuccess: status === 'success',
    refetch,
  };
}

