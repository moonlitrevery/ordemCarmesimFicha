'use client';

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
    `M ${x(inner, a0)} ${y(inner, a0)}`,
    `L ${x(outer, a0)} ${y(outer, a0)}`,
    `A ${outer} ${outer} 0 0 1 ${x(outer, a1)} ${y(outer, a1)}`,
    `L ${x(inner, a1)} ${y(inner, a1)}`,
    `A ${inner} ${inner} 0 0 0 ${x(inner, a0)} ${y(inner, a0)}`,
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
