'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { loadSupabase, preloadSupabase } from '@/lib/supabase/lazy';

type Step = 'idle' | 'confirm' | 'type-name';

export function DeleteCharacterButton({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const router = useRouter();
  useEffect(() => preloadSupabase(), []);
  const [step, setStep] = useState<Step>('idle');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setStep('idle');
    setTyped('');
    setError(null);
  }, [busy]);

  useEffect(() => {
    if (step === 'idle') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [step, close]);

  const nameOk = typed.trim() === characterName.trim();

  async function handleDelete() {
    if (!nameOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = await loadSupabase();
      const { error: delErr } = await supabase
        .from('characters')
        .delete()
        .eq('id', characterId);
      if (delErr) throw delErr;
      close();
      router.refresh();
    } catch {
      setError('Não foi possível apagar a ficha. Tente de novo.');
      setBusy(false);
    }
  }

  const modal =
    mounted && step !== 'idle'
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 p-4 backdrop-blur-[2px] sm:items-center"
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar exclusão da ficha"
          >
            <div
              className="panel w-full max-w-md space-y-4 p-4 shadow-panel md:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              {step === 'confirm' && (
                <>
                  <h3 className="font-display text-2xl text-parchment">
                    Apagar ficha?
                  </h3>
                  <p className="text-sm text-ink-muted">
                    Tem certeza que deseja apagar a ficha de{' '}
                    <span className="font-medium text-parchment">
                      {characterName || 'Sem nome'}
                    </span>
                    ? Essa ação não pode ser desfeita.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={close}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-primary bg-crimson"
                      onClick={() => {
                        setTyped('');
                        setError(null);
                        setStep('type-name');
                      }}
                    >
                      Continuar
                    </button>
                  </div>
                </>
              )}

              {step === 'type-name' && (
                <>
                  <h3 className="font-display text-2xl text-parchment">
                    Confirmação final
                  </h3>
                  <p className="text-sm text-ink-muted">
                    Digite o nome do personagem exatamente como está na ficha
                    para confirmar a exclusão:
                  </p>
                  <p className="rounded-md border border-ink-border bg-ink-raised/50 px-3 py-2 font-display text-parchment">
                    {characterName || 'Sem nome'}
                  </p>
                  <label className="block space-y-1">
                    <span className="label">Nome do personagem</span>
                    <input
                      className="field"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="Digite o nome aqui"
                      autoFocus
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && nameOk) void handleDelete();
                      }}
                    />
                  </label>
                  {error && (
                    <p className="text-sm text-crimson-soft">{error}</p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={close}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-primary disabled:opacity-40"
                      disabled={!nameOk || busy}
                      onClick={() => void handleDelete()}
                    >
                      {busy ? 'Apagando…' : 'Apagar definitivamente'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="btn-ghost px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setStep('confirm');
        }}
        title="Apagar ficha"
        aria-label={'Apagar ficha de ' + (characterName || 'personagem')}
      >
        Apagar
      </button>
      {modal}
    </>
  );
}