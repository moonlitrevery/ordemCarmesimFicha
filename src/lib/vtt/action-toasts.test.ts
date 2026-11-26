import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOASTS, pushToast, trackAction, useActionToasts } from './action-toasts';

const toasts = () => useActionToasts.getState().toasts;

describe('toasts de ação', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useActionToasts.setState({ toasts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('empilha no máximo 3, saindo o mais antigo', () => {
    for (const text of ['a', 'b', 'c', 'd']) pushToast(text);
    expect(toasts().map((t) => t.text)).toEqual(['b', 'c', 'd']);
    expect(toasts()).toHaveLength(MAX_TOASTS);
  });

  it('pendente vira pronto e some depois', async () => {
    await trackAction(async () => true, { pending: 'Movendo…', success: 'Pronto' });
    expect(toasts()).toMatchObject([{ state: 'success', text: 'Pronto' }]);
    vi.advanceTimersByTime(3000);
    vi.advanceTimersByTime(200); // animação de saída
    expect(toasts()).toEqual([]);
  });

  it('`false` só tira o toast (a função já avisou o erro)', async () => {
    await trackAction(async () => false, { pending: 'Movendo…', success: 'Pronto' });
    expect(toasts()).toMatchObject([{ leaving: true }]);
    vi.advanceTimersByTime(200);
    expect(toasts()).toEqual([]);
  });

  it('exceção vira erro e continua subindo; com `error: null`, só sai', async () => {
    const fail = () => Promise.reject(new Error('Sem conexão'));
    await expect(trackAction(fail, { pending: 'Enviando…', success: 'Enviado' })).rejects.toThrow();
    expect(toasts()).toMatchObject([{ state: 'error', text: 'Sem conexão' }]);
    useActionToasts.setState({ toasts: [] });
    await expect(trackAction(fail, { pending: 'Aprovando…', success: 'Ok', error: null })).rejects.toThrow();
    vi.advanceTimersByTime(200);
    expect(toasts()).toEqual([]);
  });
});
