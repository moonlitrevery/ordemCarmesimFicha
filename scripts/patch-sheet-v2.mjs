import fs from 'fs';

const p = 'src/components/character/CharacterSheet.tsx';
let s = fs.readFileSync(p, 'utf8');

// imports
s = s.replace(
  "import { useCallback, useEffect, useMemo, useState } from 'react';",
  "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';"
);

s = s.replace(
  `import {
  computeDerivedMaxes,
  getAttributeModifier,
  getCarryLimit,
  getInventoryWeight,
  getSkillTotal,
  getTotalLevel,
} from '@/lib/calculations';`,
  `import {
  computeDerivedMaxes,
  formatModifier,
  getAttributeModifier,
  getCarryLimit,
  getInventoryWeight,
  getSkillRollModifier,
  getSkillTotal,
  getTotalLevel,
} from '@/lib/calculations';`
);

s = s.replace(
  "import { InlineRollButton } from '@/components/dice/DiceRoller';",
  "import { InlineRollButton, QuickRollButton } from '@/components/dice/DiceRoller';"
);

// Fix save race: refs + merge ids only
const oldEffect = `  useEffect(() => {
    if (!ready) return;
    setStatus('saving');
    const t = setTimeout(async () => {
      try {
        await persistCharacter(sheet, elements);
        // refresh element ids
        const supabase = createClient();
        const { data } = await supabase
          .from('character_elements')
          .select('*')
          .eq('character_id', character.id);
        if (data) setElements(data as CharacterElementRow[]);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 700);
    return () => clearTimeout(t);
  }, [sheet, elements, ready, persistCharacter, character.id]);`;

const newEffect = `  const sheetRef = useRef(sheet);
  const elementsRef = useRef(elements);
  sheetRef.current = sheet;
  elementsRef.current = elements;

  useEffect(() => {
    if (!ready) return;
    setStatus('saving');
    const t = setTimeout(async () => {
      const snapSheet = sheetRef.current;
      const snapElements = elementsRef.current;
      try {
        await persistCharacter(snapSheet, snapElements);
        const supabase = createClient();
        const { data } = await supabase
          .from('character_elements')
          .select('id, element')
          .eq('character_id', character.id);
        if (data) {
          // Só mescla IDs — não sobrescreve níveis/fragmentos locais (evita rollback)
          setElements((prev) =>
            prev.map((row) => {
              const found = data.find((d) => d.element === row.element);
              return found ? { ...row, id: found.id } : row;
            })
          );
        }
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 700);
    return () => clearTimeout(t);
  }, [sheet, elements, ready, persistCharacter, character.id]);`;

if (s.includes(oldEffect)) {
  s = s.replace(oldEffect, newEffect);
  console.log('save race fixed');
} else {
  console.log('WARN: save effect not found exact');
}

// Attribute roll -> QuickRollButton
s = s.replace(
  /<InlineRollButton\s+notation="1d20"\s+label=\{ATTRIBUTE_LABELS\[key\] \+ ' \(meta ' \+ value \+ '\)'\}\s*\/>/,
  `<QuickRollButton bonus={mod} label={ATTRIBUTE_LABELS[key]} />`
);

// Skills section - update total display and roll
s = s.replace(
  `{sheet.skills.map((skill, i) => {
          const total = getSkillTotal(skill, sheet.attributes);
          return (
            <div
              key={i}
              className="grid gap-2 rounded-md border border-ink-border bg-ink-raised/40 p-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center"
            >`,
  `{sheet.skills.map((skill, i) => {
          const total = getSkillTotal(skill, sheet.attributes);
          const rollMod = getSkillRollModifier(total);
          return (
            <div
              key={i}
              className="grid gap-2 rounded-md border border-ink-border bg-ink-raised/40 p-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] sm:items-center"
            >`
);

s = s.replace(
  `<span className="text-center font-display text-xl text-crimson-soft">
                {total}
              </span>
              <div className="flex items-center gap-1">
                <InlineRollButton notation="1d20" label={skill.name + " (meta " + total + ")"} />`,
  `<div className="text-center">
                <p className="font-display text-xl text-crimson-soft">{total}</p>
                <p className="text-xs text-ink-muted">d20 {formatModifier(rollMod)}</p>
              </div>
              <div className="flex items-center gap-1">
                <QuickRollButton bonus={rollMod} label={skill.name} />`
);

// Resources with heal/damage
const oldRes = `      {/* Recursos */}
      <SectionCard title="Recursos">
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ['HP', 'hp_current', derived.hpMax, '#8B1E2D'],
              ['Mana', 'mana_current', derived.manaMax, '#3B6EA5'],
              ['Sanidade', 'sanity_current', derived.sanityMax, '#7A6B9A'],
            ] as const
          ).map(([label, key, max, color]) => {
            const current = sheet[key];
            const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-end justify-between">
                  <span className="label">{label}</span>
                  <div className="flex items-center gap-1 text-sm">
                    <input
                      type="number"
                      className="field w-16 py-1 text-center"
                      value={current}
                      onChange={(e) =>
                        patch({ [key]: Number(e.target.value) || 0 } as Partial<SheetState>)
                      }
                    />
                    <span className="text-ink-muted">/ {max}</span>
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-ink">
                  <div
                    className="h-full transition-all"
                    style={{ width: \`\${pct}%\`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>`;

// Use real backticks in file - search without escape
const resStart = s.indexOf('{/* Recursos */}');
const resEnd = s.indexOf('<ElementsSection', resStart);
if (resStart !== -1 && resEnd !== -1) {
  const replacement = `      {/* Recursos */}
      <SectionCard title="Recursos">
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ['HP', 'hp_current', derived.hpMax, '#8B1E2D'],
              ['Mana', 'mana_current', derived.manaMax, '#3B6EA5'],
              ['Sanidade', 'sanity_current', derived.sanityMax, '#7A6B9A'],
            ] as const
          ).map(([label, key, max, color]) => {
            const current = sheet[key];
            const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
            function adjust(delta: number) {
              const next = Math.max(0, Math.min(max, current + delta));
              patch({ [key]: next } as Partial<SheetState>);
            }
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-end justify-between gap-2">
                  <span className="label">{label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn-ghost h-9 w-9 p-0 text-lg"
                      onClick={() => adjust(-1)}
                      title={'Remover 1 de ' + label}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      className="field w-16 py-1 text-center"
                      value={current}
                      onChange={(e) =>
                        patch({ [key]: Number(e.target.value) || 0 } as Partial<SheetState>)
                      }
                    />
                    <span className="text-ink-muted">/ {max}</span>
                    <button
                      type="button"
                      className="btn-ghost h-9 w-9 p-0 text-lg"
                      onClick={() => adjust(1)}
                      title={'Curar 1 de ' + label}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost flex-1 py-1 text-sm" onClick={() => adjust(-5)}>
                    −5
                  </button>
                  <button type="button" className="btn-ghost flex-1 py-1 text-sm" onClick={() => adjust(5)}>
                    +5 curar
                  </button>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-ink">
                  <div
                    className="h-full transition-all"
                    style={{ width: pct + '%', backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      `;
  s = s.slice(0, resStart) + replacement + s.slice(resEnd);
  console.log('resources updated');
} else {
  console.log('WARN resources block not found');
}

fs.writeFileSync(p, s);
console.log('sheet patched', {
  quick: s.includes('QuickRollButton'),
  skillRoll: s.includes('getSkillRollModifier'),
  refs: s.includes('elementsRef'),
  heal: s.includes('+5 curar'),
});
