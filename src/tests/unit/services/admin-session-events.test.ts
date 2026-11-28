/**
 * Suíte de Testes Unitários: Barramento Multi-Aba e Limpeza de Sessão Administrativa
 * (src/services/admin-session-events.ts)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_LOGIN_REASONS } from '@/modules/auth/auth.contracts';
import {
  ADMIN_SESSION_CHANNEL_NAME,
  IMPORTACAO_PREVIEW_STORAGE_KEY,
  LOGIN_SUCCESS_TOAST_STORAGE_KEY,
  LOGIN_SUCCESS_TOAST_MAX_AGE_MS,
  broadcastAdminSessionEvent,
  clearPreviewSession,
  consumeAdminLoginSuccessToast,
  markAdminLoginSuccessToast,
  notifyAdminSessionExpired,
  resetAdminSessionEventsState,
  subscribeAdminSessionBroadcast,
  subscribeAdminSessionEvents,
  terminateClientAdminSession,
  type AdminSessionEvent,
} from '@/services/admin-session-events';

class FakeBroadcastChannel {
  private static channels = new Map<string, Set<FakeBroadcastChannel>>();

  public readonly name: string;
  public closed = false;
  private listeners = new Set<(event: MessageEvent<unknown>) => void>();

  constructor(name: string) {
    this.name = name;
    let group = FakeBroadcastChannel.channels.get(name);
    if (!group) {
      group = new Set();
      FakeBroadcastChannel.channels.set(name, group);
    }
    group.add(this);
  }

  public postMessage(data: unknown): void {
    const group = FakeBroadcastChannel.channels.get(this.name);
    if (!group) {
      return;
    }

    for (const peer of Array.from(group)) {
      if (peer === this || peer.closed) {
        continue;
      }
      const messageEvent = { data } as MessageEvent<unknown>;
      for (const listener of Array.from(peer.listeners)) {
        listener(messageEvent);
      }
    }
  }

  public addEventListener(
    type: string,
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  public removeEventListener(
    type: string,
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }

  public close(): void {
    this.closed = true;
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  public static resetAll(): void {
    FakeBroadcastChannel.channels.clear();
  }
}

describe('Barramento de Eventos e Multi-Aba Administrativo (src/services/admin-session-events.ts)', () => {
  beforeEach(() => {
    resetAdminSessionEventsState();
    FakeBroadcastChannel.resetAll();
  });

  afterEach(() => {
    resetAdminSessionEventsState();
    FakeBroadcastChannel.resetAll();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deve emitir e cancelar assinatura de eventos locais de sessão expirada', () => {
    const received: AdminSessionEvent[] = [];
    const unsubscribe = subscribeAdminSessionEvents((event) => {
      received.push(event);
    });

    notifyAdminSessionExpired();
    expect(received).toEqual([{ type: ADMIN_LOGIN_REASONS.SESSION_EXPIRED }]);

    unsubscribe();
    notifyAdminSessionExpired();
    expect(received).toHaveLength(1);
  });

  it('deve propagar logout e expiração entre abas via BroadcastChannel e ignorar mensagens inválidas', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    const received: AdminSessionEvent[] = [];
    const unsubscribe = subscribeAdminSessionBroadcast((event) => {
      received.push(event);
    });

    broadcastAdminSessionEvent(ADMIN_LOGIN_REASONS.LOGOUT);
    broadcastAdminSessionEvent(ADMIN_LOGIN_REASONS.SESSION_EXPIRED);

    // Mensagem malformada/fora da allowlist deve ser descartada
    const rawSender = new FakeBroadcastChannel(ADMIN_SESSION_CHANNEL_NAME);
    rawSender.postMessage({ type: 'mensagem_hostil_qualquer' });
    rawSender.postMessage(null);
    rawSender.postMessage('string_invalida');
    rawSender.close();

    expect(received).toEqual([
      { type: ADMIN_LOGIN_REASONS.LOGOUT },
      { type: ADMIN_LOGIN_REASONS.SESSION_EXPIRED },
    ]);

    unsubscribe();
    broadcastAdminSessionEvent(ADMIN_LOGIN_REASONS.LOGOUT);
    expect(received).toHaveLength(2);
  });

  it('deve operar sem falhar quando BroadcastChannel não estiver disponível', () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    const listener = vi.fn();
    const unsubscribe = subscribeAdminSessionBroadcast(listener);
    expect(() => broadcastAdminSessionEvent(ADMIN_LOGIN_REASONS.LOGOUT)).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('terminateClientAdminSession deve limpar sessionStorage, propagar BroadcastChannel, redirecionar e respeitar trava single-flight', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

    const store = new Map<string, string>([
      [IMPORTACAO_PREVIEW_STORAGE_KEY, '{"importacaoId":42}'],
    ]);
    const replaceMock = vi.fn();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
      location: {
        pathname: '/admin/importacoes/historico',
        search: '?page=2',
        replace: replaceMock,
      },
    });

    const remoteEvents: AdminSessionEvent[] = [];
    const unsubscribeBroadcast = subscribeAdminSessionBroadcast((event) => {
      remoteEvents.push(event);
    });

    const firstDestination = terminateClientAdminSession(
      ADMIN_LOGIN_REASONS.SESSION_EXPIRED
    );
    const secondDestination = terminateClientAdminSession(
      ADMIN_LOGIN_REASONS.SESSION_EXPIRED
    );

    expect(firstDestination).toBe(
      '/admin/login?next=%2Fadmin%2Fimportacoes%2Fhistorico%3Fpage%3D2&motivo=sessao_expirada'
    );
    expect(secondDestination).toBeNull();
    expect(store.has(IMPORTACAO_PREVIEW_STORAGE_KEY)).toBe(false);
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(firstDestination);
    expect(remoteEvents).toEqual([{ type: ADMIN_LOGIN_REASONS.SESSION_EXPIRED }]);

    unsubscribeBroadcast();
  });

  it('terminateClientAdminSession em logout intencional não deve anexar ?next e deve bloquear Open Redirect em sessao_expirada', () => {
    const navigateMock = vi.fn();

    const logoutUrl = terminateClientAdminSession(ADMIN_LOGIN_REASONS.LOGOUT, {
      currentPath: '/admin/importacoes',
      broadcast: false,
      navigate: navigateMock,
    });
    expect(logoutUrl).toBe('/admin/login?motivo=logout');
    expect(navigateMock).toHaveBeenLastCalledWith('/admin/login?motivo=logout');

    resetAdminSessionEventsState();

    const hostileExpiredUrl = terminateClientAdminSession(
      ADMIN_LOGIN_REASONS.SESSION_EXPIRED,
      {
        currentPath: 'https://evil.example/phishing',
        broadcast: false,
        navigate: navigateMock,
      }
    );
    expect(hostileExpiredUrl).toBe('/admin/login?motivo=sessao_expirada');
    expect(navigateMock).toHaveBeenLastCalledWith('/admin/login?motivo=sessao_expirada');
  });

  it('clearPreviewSession deve ser seguro mesmo quando window ou sessionStorage não existirem', () => {
    expect(() => clearPreviewSession()).not.toThrow();
  });

  it('markAdminLoginSuccessToast e consumeAdminLoginSuccessToast devem ser de leitura única e respeitar TTL de 60s', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });

    markAdminLoginSuccessToast(1_000);
    expect(store.has(LOGIN_SUCCESS_TOAST_STORAGE_KEY)).toBe(true);
    expect(consumeAdminLoginSuccessToast(5_000)).toBe(true);
    expect(consumeAdminLoginSuccessToast(5_500)).toBe(false);

    // Expirado após 60s
    markAdminLoginSuccessToast(10_000);
    expect(
      consumeAdminLoginSuccessToast(10_000 + LOGIN_SUCCESS_TOAST_MAX_AGE_MS + 1)
    ).toBe(false);

    // clearPreviewSession limpa pendência de toast de login também
    markAdminLoginSuccessToast(20_000);
    clearPreviewSession();
    expect(consumeAdminLoginSuccessToast(21_000)).toBe(false);
  });
});
