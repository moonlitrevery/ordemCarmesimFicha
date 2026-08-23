import fs from 'fs';

// —— 1. DEFAULT_SKILLS in constants ——
const constantsPath = 'src/lib/constants.ts';
let constants = fs.readFileSync(constantsPath, 'utf8');
if (!constants.includes('DEFAULT_SKILLS')) {
  const block = `
export const DEFAULT_SKILLS: {
  name: string;
  attribute: 'FOR' | 'CON' | 'DES' | 'INT' | 'EDU' | 'CAR' | 'POD';
  specialization: 'none' | 'basico' | 'medio' | 'alto' | 'expert';
}[] = [
  { name: 'Combate', attribute: 'FOR', specialization: 'none' },
  { name: 'Arremesso', attribute: 'DES', specialization: 'none' },
  { name: 'Atletismo', attribute: 'FOR', specialization: 'none' },
  { name: 'Escutar', attribute: 'INT', specialization: 'none' },
  { name: 'Acrobacia', attribute: 'DES', specialization: 'none' },
  { name: 'Furtividade', attribute: 'DES', specialization: 'none' },
  { name: 'Condução', attribute: 'DES', specialization: 'none' },
  { name: 'Tiro', attribute: 'DES', specialization: 'none' },
  { name: 'Esquiva', attribute: 'DES', specialization: 'none' },
  { name: 'Refletir', attribute: 'INT', specialization: 'none' },
  { name: 'Computação', attribute: 'INT', specialization: 'none' },
  { name: 'Percepção', attribute: 'INT', specialization: 'none' },
  { name: 'Investigação', attribute: 'INT', specialization: 'none' },
  { name: 'Medicina', attribute: 'EDU', specialization: 'none' },
  { name: 'Psicoanalisar', attribute: 'CAR', specialization: 'none' },
  { name: 'Natureza', attribute: 'EDU', specialization: 'none' },
  { name: 'Profissão', attribute: 'EDU', specialization: 'none' },
  { name: 'Charme', attribute: 'CAR', specialization: 'none' },
  { name: 'Intimidação', attribute: 'CAR', specialization: 'none' },
  { name: 'Lábia', attribute: 'CAR', specialization: 'none' },
  { name: 'Arcano', attribute: 'POD', specialization: 'none' },
  { name: 'Mitos', attribute: 'POD', specialization: 'none' },
];
`;
  constants = constants.replace(
    'export const SPECIALIZATION_LABELS',
    block + '\nexport const SPECIALIZATION_LABELS'
  );
  fs.writeFileSync(constantsPath, constants);
  console.log('constants: DEFAULT_SKILLS');
}

// —— 2. ElementsSection visibility fix ——
fs.writeFileSync(
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
`
);
console.log('ElementsSection fixed');

// —— 3. Dice icon + portal popover ——
fs.writeFileSync(
  'src/components/dice/DiceRoller.tsx',
  `'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMMON_DICE, parseDiceNotation, rollDice, type DiceRollResult } from '@/lib/dice';

export function DiceIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M5.5 3h13A2.5 2.5 0 0 1 21 5.5v13A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3Zm1.25 3.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM6.75 11a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM6.75 16.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm5.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z" />
    </svg>
  );
}

export function DiceRoller({
  initialNotation = '1d20',
  compact = false,
  onClose,
}: {
  initialNotation?: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [notation, setNotation] = useState(initialNotation);
  const [result, setResult] = useState<DiceRollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  async function handleRoll(override?: string) {
    const n = (override ?? notation).trim();
    if (!parseDiceNotation(n)) {
      setError('Use o formato XdY+Z (ex: 2d6+3)');
      return;
    }
    setError(null);
    setRolling(true);
    setNotation(n);
    await new Promise((r) => setTimeout(r, 350));
    const rolled = rollDice(n);
    setResult(rolled);
    setRolling(false);
  }

  return (
    <div className={\`space-y-3 \${compact ? '' : 'panel p-4'}\`}>
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-parchment">Rolar Dados</h3>
          {onClose && (
            <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={onClose}>
              Fechar
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {COMMON_DICE.map((d) => (
          <button
            key={d}
            type="button"
            className="btn-ghost px-2.5 py-1 text-sm"
            onClick={() => handleRoll(\`1\${d}\`)}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="field"
          value={notation}
          onChange={(e) => setNotation(e.target.value)}
          placeholder="2d6+3"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRoll();
          }}
        />
        <button type="button" className="btn-primary shrink-0" onClick={() => handleRoll()}>
          Rolar
        </button>
      </div>
      {error && <p className="text-base text-crimson-soft">{error}</p>}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={\`\${result.total}-\${result.breakdown}\`}
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{
              opacity: 1,
              scale: rolling ? [1, 1.04, 0.98, 1] : 1,
              y: 0,
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35 }}
            className="rounded-md border border-crimson/30 bg-ink-raised px-4 py-3 text-center"
          >
            <p className="label mb-1">{result.notation}</p>
            <p className="font-display text-5xl text-crimson-soft">{result.total}</p>
            <p className="mt-1 text-base text-ink-muted">{result.breakdown}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InlineRollButton({
  notation,
  label,
}: {
  notation: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const width = 300;
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    );
    const top = Math.min(rect.bottom + 8, window.innerHeight - 320);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn-ghost inline-flex h-10 w-10 items-center justify-center p-0"
        onClick={() => setOpen((v) => !v)}
        title={label ? \`Rolar \${label} (\${notation})\` : \`Rolar \${notation}\`}
        aria-label={label ? \`Rolar \${label}\` : \`Rolar \${notation}\`}
      >
        <DiceIcon className="h-5 w-5" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[9999] w-[300px] rounded-lg border border-ink-border bg-ink-panel p-3 shadow-panel"
            style={{ top: pos.top, left: pos.left }}
          >
            <DiceRoller
              initialNotation={notation}
              compact
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body
        )}
    </>
  );
}
`
);
console.log('DiceRoller updated');

console.log('partial done — continue with sheet/layout in next script');
