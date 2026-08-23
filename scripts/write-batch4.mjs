import fs from 'fs';
import path from 'path';

const root = process.cwd();
function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote', rel);
}

write(
  'src/components/mosaic/MosaicFrame.tsx',
  `'use client';

import { motion } from 'framer-motion';
import { ALL_ELEMENTS, ELEMENT_COLORS, ELEMENT_LABELS } from '@/lib/constants';
import type { CharacterElementRow, ElementType } from '@/types/database';

/** Rosácea gótica — 11 painéis ao redor de um centro */
function panelPath(index: number, total: number): string {
  const cx = 100;
  const cy = 100;
  const inner = 28;
  const outer = 92;
  const sweep = (Math.PI * 2) / total;
  const start = -Math.PI / 2 + index * sweep;
  const end = start + sweep;
  const pad = 0.012;
  const a0 = start + pad;
  const a1 = end - pad;

  const x = (r: number, a: number) => cx + r * Math.cos(a);
  const y = (r: number, a: number) => cy + r * Math.sin(a);

  return [
    \`M \${x(inner, a0)} \${y(inner, a0)}\`,
    \`L \${x(outer, a0)} \${y(outer, a0)}\`,
    \`A \${outer} \${outer} 0 0 1 \${x(outer, a1)} \${y(outer, a1)}\`,
    \`L \${x(inner, a1)} \${y(inner, a1)}\`,
    \`A \${inner} \${inner} 0 0 0 \${x(inner, a0)} \${y(inner, a0)}\`,
    'Z',
  ].join(' ');
}

function levelOf(elements: CharacterElementRow[], element: ElementType) {
  return elements.find((e) => e.element === element)?.level ?? 0;
}

export function MosaicFrame({
  characterName,
  elements,
}: {
  characterName: string;
  elements: CharacterElementRow[];
}) {
  return (
    <section className="panel space-y-4 p-4 md:p-6">
      <h2 className="section-title text-center">
        O Mosaico de {characterName || '—'}
      </h2>
      <div className="mx-auto aspect-square w-full max-w-md">
        <svg viewBox="0 0 200 200" className="h-full w-full">
          <circle
            cx="100"
            cy="100"
            r="96"
            fill="none"
            stroke="#2A2228"
            strokeWidth="2"
          />
          <circle
            cx="100"
            cy="100"
            r="94"
            fill="none"
            stroke="#8B1E2D"
            strokeWidth="0.75"
            opacity="0.5"
          />
          {ALL_ELEMENTS.map((element, i) => {
            const level = levelOf(elements, element);
            const opacity = level <= 0 ? 0.08 : 0.15 + (level / 20) * 0.85;
            const color = ELEMENT_COLORS[element];
            return (
              <motion.path
                key={element}
                d={panelPath(i, ALL_ELEMENTS.length)}
                fill={level <= 0 ? '#2A2228' : color}
                initial={false}
                animate={{ opacity }}
                transition={{ duration: 0.6 }}
                stroke="#0C0A0D"
                strokeWidth="1.2"
              >
                <title>
                  {ELEMENT_LABELS[element]} — nível {level}
                </title>
              </motion.path>
            );
          })}
          <circle cx="100" cy="100" r="26" fill="#161218" stroke="#8B1E2D" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="8" fill="#8B1E2D" opacity="0.85" />
        </svg>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {ALL_ELEMENTS.map((el) => {
          const level = levelOf(elements, el);
          if (level <= 0) return null;
          return (
            <span
              key={el}
              className="rounded-full border border-ink-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-muted"
              style={{ borderColor: ELEMENT_COLORS[el] }}
            >
              {ELEMENT_LABELS[el]} {level}
            </span>
          );
        })}
      </div>
    </section>
  );
}
`
);

write(
  'src/components/character/LevelProgression.tsx',
  `'use client';

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

  return (
    <section className="panel space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Nível total</p>
          <p className="font-display text-6xl leading-none text-crimson-soft">{total}</p>
          <p className="mt-1 text-xs text-ink-muted">Soma dos níveis dos elementos · teto 20</p>
        </div>
        {next && (
          <div className="max-w-sm rounded-md border border-crimson/30 bg-crimson/10 px-3 py-2">
            <p className="label text-crimson-soft">Próximo marco · Nível {next.level}</p>
            <p className="mt-1 font-display text-lg text-parchment">{next.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{next.description}</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="label">Arcana {total >= 8 ? '' : '(desbloqueia no 8)'}</span>
          <input
            className="field"
            value={arcana}
            onChange={(e) => onArcanaChange(e.target.value)}
            placeholder="Ex: O Julgamento"
            disabled={total < 8}
          />
        </label>
        <label className="space-y-1.5">
          <span className="label">Subarcana {total >= 15 ? '' : '(desbloqueia no 15)'}</span>
          <input
            className="field"
            value={subarcana}
            onChange={(e) => onSubarcanaChange(e.target.value)}
            placeholder="Subarcana"
            disabled={total < 15}
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="label">Marcos alcançados</p>
        {reached.length === 0 && (
          <p className="text-sm text-ink-muted">Nenhum marco ainda.</p>
        )}
        {reached.map((m) => (
          <div
            key={m.level}
            className="rounded-md border border-ink-border bg-ink-raised/50 px-3 py-2"
          >
            <p className="font-display text-parchment">
              <span className="text-crimson-soft">{m.level}</span> — {m.title}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">{m.description}</p>
            <textarea
              className="field mt-2 min-h-[60px]"
              placeholder="Anotação do mestre sobre este marco…"
              value={milestoneNotes[String(m.level)] ?? ''}
              onChange={(e) => onMilestoneNoteChange(m.level, e.target.value)}
            />
          </div>
        ))}
      </div>

      {total >= 20 && (
        <p className="rounded-md border border-crimson/40 bg-crimson/15 px-3 py-2 text-sm text-parchment">
          Nível 20 atingido — evolução passa a vir de Feitos Históricos, não de fragmentos.
        </p>
      )}
    </section>
  );
}
`
);

write(
  'src/components/character/ElementsSection.tsx',
  `'use client';

import { useMemo, useState } from 'react';
import { ALL_ELEMENTS, ELEMENT_LABELS } from '@/lib/constants';
import { ElementFragmentBar } from '@/components/elements/ElementFragmentBar';
import { SectionCard } from '@/components/ui/SectionCard';
import type { CharacterElementRow, ElementType } from '@/types/database';

export function ElementsSection({
  elements,
  onChange,
}: {
  elements: CharacterElementRow[];
  onChange: (
    next: CharacterElementRow[],
    meta?: { leveledUp: boolean; blockedByCap: boolean; levelsGained: number }
  ) => void;
}) {
  const visible = useMemo(
    () =>
      ALL_ELEMENTS.filter((el) => {
        const row = elements.find((e) => e.element === el);
        return row && (row.level > 0 || row.fragments_current > 0);
      }),
    [elements]
  );

  const hidden = ALL_ELEMENTS.filter((el) => !visible.includes(el));
  const [picking, setPicking] = useState(false);

  function addElement(el: ElementType) {
    if (elements.some((e) => e.element === el)) {
      setPicking(false);
      return;
    }
    onChange([...elements, { element: el, level: 0, fragments_current: 0 }]);
    setPicking(false);
  }

  return (
    <SectionCard
      title="Elementos e Fragmentos"
      action={
        hidden.length > 0 ? (
          <button type="button" className="btn-ghost text-xs" onClick={() => setPicking((v) => !v)}>
            {picking ? 'Cancelar' : '+ Adicionar elemento'}
          </button>
        ) : null
      }
    >
      {picking && (
        <div className="flex flex-wrap gap-2 rounded-md border border-ink-border bg-ink-raised/40 p-3">
          {hidden.map((el) => (
            <button
              key={el}
              type="button"
              className="btn-ghost text-xs"
              onClick={() => addElement(el)}
            >
              {ELEMENT_LABELS[el]}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 && !picking && (
        <p className="text-sm text-ink-muted">
          Nenhum elemento ativo. Adicione o primeiro elemento do personagem.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((el) => (
          <ElementFragmentBar
            key={el}
            elements={elements}
            element={el}
            onChange={(next, meta) => onChange(next, meta)}
          />
        ))}
      </div>
    </SectionCard>
  );
}
`
);

console.log('batch 4 done');
