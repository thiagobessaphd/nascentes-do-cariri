import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import MapFeedback from '@/components/map/MapFeedback';
import styles from '@/components/map/map.module.css';

describe('Componente de Feedback Visual do Mapa (src/components/map/MapFeedback.tsx)', () => {
  describe('1. Estado de Carregamento (loading)', () => {
    it('deve renderizar o card de carregamento com semântica acessível role="status", aria-live="polite" e spinner', () => {
      const html = renderToString(React.createElement(MapFeedback, { status: 'loading' }));

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Carregando nascentes...');
      expect(html).toContain(styles.feedbackCard);
      expect(html).toContain(styles.feedbackLoading);
      expect(html).toContain(styles.feedbackSpinner);
    });
  });

  describe('2. Estado de Erro com Retry (error)', () => {
    it('deve renderizar o card de erro com role="alert", aria-live="assertive" e mensagem personalizada', () => {
      const customError = 'Dificuldade de conexão com o servidor. Verifique sua internet.';
      const html = renderToString(
        React.createElement(MapFeedback, {
          status: 'error',
          error: customError,
          onRetry: vi.fn(),
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain(customError);
      expect(html).toContain(styles.feedbackCard);
      expect(html).toContain(styles.feedbackError);
      expect(html).toContain('Tentar novamente');
      expect(html).toContain('aria-label="Tentar carregar as nascentes novamente"');
      expect(html).toContain('type="button"');
    });

    it('deve usar mensagem segura padrão caso nenhuma mensagem seja informada no erro', () => {
      const html = renderToString(
        React.createElement(MapFeedback, {
          status: 'error',
          onRetry: vi.fn(),
        })
      );

      expect(html).toContain('Não foi possível carregar as nascentes no momento.');
    });

    it('não deve renderizar o botão de retry caso o callback onRetry não seja fornecido', () => {
      const html = renderToString(
        React.createElement(MapFeedback, {
          status: 'error',
          error: 'Falha temporária',
        })
      );

      expect(html).toContain('Falha temporária');
      expect(html).not.toContain('Tentar novamente');
    });
  });

  describe('3. Estado Vazio (empty)', () => {
    it('deve renderizar o aviso acessível de nenhum resultado com botão de fechar [×] e card unificado', () => {
      const html = renderToString(React.createElement(MapFeedback, { status: 'empty' }));

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Nenhuma nascente encontrada para esta região.');
      expect(html).toContain(styles.feedbackCard);
      expect(html).toContain(styles.feedbackEmpty);
      expect(html).toContain(styles.feedbackInfoIcon);
      expect(html).toContain(styles.feedbackDismissButton);
      expect(html).toContain('aria-label="Fechar aviso de nenhuma nascente encontrada"');
    });
  });

  describe('4. Estados Silenciosos (idle e success)', () => {
    it('não deve renderizar nada (retornar nulo) quando o status for idle', () => {
      const html = renderToString(React.createElement(MapFeedback, { status: 'idle' }));
      expect(html).toBe('');
    });

    it('não deve renderizar nada (retornar nulo) quando o status for success', () => {
      const html = renderToString(React.createElement(MapFeedback, { status: 'success' }));
      expect(html).toBe('');
    });
  });
});
