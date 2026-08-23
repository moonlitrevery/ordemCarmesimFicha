'use client';

import { useMemo, useState } from 'react';
import { ALL_ELEMENTS, ELEMENT_COLORS, ELEMENT_LABELS } from '@/lib/constants';
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
    meta?: {
      leveledUp?: boolean;
      leveledDown?: boolean;
      blockedByCap?: boolean;
      levelsGained?: number;
      levelsLost?: number;
    }
  ) => void;
}) {
  // Qualquer elemento já na lista aparece (mesmo com nível 0 e 0 fragmentos)
  const activeElements = useMemo(
    () =>
      ALL_ELEMENTS.filter((el) => elements.some((e) => e.element === el)),
    [elements]
  );

  const hidden = ALL_ELEMENTS.filter((el) => !activeElements.includes(el));
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
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => setPicking((v) => !v)}
          >
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
              className="btn-ghost text-sm"
              onClick={() => addElement(el)}
              style={{
                color: ELEMENT_COLORS[el],
                textShadow:
                  el === 'luz' || el === 'sombra'
                    ? '0 0 8px rgba(255,255,255,0.55), 0 0 14px rgba(255,255,255,0.3)'
                    : undefined,
              }}
            >
              {ELEMENT_LABELS[el]}
            </button>
          ))}
        </div>
      )}

      {activeElements.length === 0 && !picking && (
        <p className="text-base text-ink-muted">
          Nenhum elemento ativo. Adicione o primeiro elemento do personagem.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {activeElements.map((el) => (
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
