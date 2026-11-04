'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getNextMilestone,
  getReachedMilestones,
  getTotalLevel,
} from '@/lib/calculations';
import type { CharacterElementRow, MilestoneNotes } from '@/types/database';

export function LevelProgression({
  elements,
  isOrderAgent,
  arcana,
  subarcana,
  milestoneNotes,
  onArcanaChange,
  onSubarcanaChange,
  onMilestoneNoteChange,
}: {
  elements: CharacterElementRow[];
  isOrderAgent: boolean;
  arcana: string;
  subarcana: string;
  milestoneNotes: MilestoneNotes;
  onArcanaChange: (v: string) => void;
  onSubarcanaChange: (v: string) => void;
  onMilestoneNoteChange: (level: number, note: string) => void;
}) {
  const total = getTotalLevel(elements);
  const next = getNextMilestone(total, isOrderAgent);
  const reached = getReachedMilestones(total, isOrderAgent);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 p-4 backdrop-blur-[2px] sm:items-center"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Marcos alcançados"
          >
            <div
              className="panel max-h-[80dvh] w-full max-w-lg overflow-y-auto p-4 shadow-panel md:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-display text-2xl text-parchment">
                  Marcos alcançados
                </h3>
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-sm"
                  onClick={() => setOpen(false)}
                >
                  Fechar
                </button>
              </div>
              {reached.length === 0 && (
                <p className="text-sm text-ink-muted">Nenhum marco ainda.</p>
              )}
              <div className="space-y-3">
                {reached.map((m) => (
                  <div
                    key={m.level}
                    className="rounded-md border border-ink-border bg-ink-raised/50 px-3 py-2"
                  >
                    <p className="font-display text-parchment">
                      <span className="text-crimson-soft">{m.level}</span> —{' '}
                      {m.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {m.description}
                    </p>
                    <textarea
                      className="field mt-2 min-h-[56px]"
                      placeholder="Anotação do mestre sobre este marco…"
                      value={milestoneNotes[String(m.level)] ?? ''}
                      onChange={(e) =>
                        onMilestoneNoteChange(m.level, e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <section className="panel space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="label">Nível total</p>
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs"
              onClick={() => setOpen(true)}
            >
              Marcos alcançados
            </button>
          </div>
          <p className="font-display text-6xl leading-none text-crimson-soft">
            {total}
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Soma dos níveis dos elementos
          </p>
        </div>
        {next && (
          <div className="max-w-sm rounded-md border border-crimson/30 bg-crimson/10 px-3 py-2">
            <p className="label text-crimson-soft">
              Próximo marco · Nível {next.level}
            </p>
            <p className="mt-1 font-display text-lg text-parchment">
              {next.title}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{next.description}</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="label">
            Arcana {total >= 8 ? '' : '(desbloqueia no 8)'}
          </span>
          <input
            className="field"
            value={arcana}
            onChange={(e) => onArcanaChange(e.target.value)}
            placeholder="Ex: O Julgamento"
            disabled={total < 8}
          />
        </label>
        <label className="space-y-1.5">
          <span className="label">
            Subarcana {total >= 15 ? '' : '(desbloqueia no 15)'}
          </span>
          <input
            className="field"
            value={subarcana}
            onChange={(e) => onSubarcanaChange(e.target.value)}
            placeholder="Subarcana"
            disabled={total < 15}
          />
        </label>
      </div>

      {total >= 20 && (
        <p className="rounded-md border border-crimson/40 bg-crimson/15 px-3 py-2 text-sm text-parchment">
          Nível 20 atingido — evolução passa a vir de Feitos Históricos, não de
          fragmentos.
        </p>
      )}

      {modal}
    </section>
  );
}
