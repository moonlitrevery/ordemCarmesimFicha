import fs from 'fs';

const p = 'src/components/character/CharacterSheet.tsx';
let s = fs.readFileSync(p, 'utf8');

// imports
if (!s.includes('WEAPON_TYPES')) {
  s = s.replace(
    `import {
  DEFAULT_SKILLS,
  ORDER_RANKS,
  SPECIALIZATION_LABELS,
  VALID_IMAGE_URL,
} from '@/lib/constants';`,
    `import {
  DEFAULT_SKILLS,
  isDefaultSkillName,
  ORDER_RANKS,
  SPECIALIZATION_LABELS,
  VALID_IMAGE_URL,
  WEAPON_TYPES,
} from '@/lib/constants';`
  );
}

if (!s.includes('DEFAULT_RESOURCE_MODS')) {
  s = s.replace(
    `import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  DEFAULT_ATTRIBUTES,
} from '@/types/database';`,
    `import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  DEFAULT_ATTRIBUTES,
  DEFAULT_RESOURCE_MODS,
  type ResourceMods,
} from '@/types/database';`
  );
}

// SheetState resource_mods
if (!s.includes('resource_mods: ResourceMods')) {
  s = s.replace(
    'order_rank: string;\n};',
    'order_rank: string;\n  resource_mods: ResourceMods;\n};'
  );
  s = s.replace(
    "order_rank: c.order_rank ?? 'Agente Principiante',\n  };",
    "order_rank: c.order_rank ?? 'Agente Principiante',\n    resource_mods: { ...DEFAULT_RESOURCE_MODS, ...(c.resource_mods || {}) },\n  };"
  );
}

// persist resource_mods
if (!s.includes('resource_mods: next.resource_mods')) {
  s = s.replace(
    'milestone_notes: next.milestone_notes,',
    'milestone_notes: next.milestone_notes,\n        resource_mods: next.resource_mods,'
  );
}

// derived maxes with mods - after derived useMemo
if (!s.includes('effectiveMaxes')) {
  s = s.replace(
    `const derived = useMemo(
    () => computeDerivedMaxes(totalLevel, sheet.attributes),
    [totalLevel, sheet.attributes]
  );`,
    `const derived = useMemo(
    () => computeDerivedMaxes(totalLevel, sheet.attributes),
    [totalLevel, sheet.attributes]
  );

  const effectiveMaxes = useMemo(
    () => ({
      hp: Math.max(1, derived.hpMax + (sheet.resource_mods.hp || 0)),
      mana: Math.max(1, derived.manaMax + (sheet.resource_mods.mana || 0)),
      sanity: Math.max(1, derived.sanityMax + (sheet.resource_mods.sanity || 0)),
    }),
    [derived, sheet.resource_mods]
  );`
  );
}

// Also update persist to use effective maxes with mods
s = s.replace(
  `const maxes = computeDerivedMaxes(
        getTotalLevel(nextElements),
        next.attributes
      );
      const payload = {`,
  `const baseMaxes = computeDerivedMaxes(
        getTotalLevel(nextElements),
        next.attributes
      );
      const mods = next.resource_mods || DEFAULT_RESOURCE_MODS;
      const maxes = {
        hpMax: Math.max(1, baseMaxes.hpMax + (mods.hp || 0)),
        manaMax: Math.max(1, baseMaxes.manaMax + (mods.mana || 0)),
        sanityMax: Math.max(1, baseMaxes.sanityMax + (mods.sanity || 0)),
      };
      const payload = {`
);

// Replace resources section
const resStart = s.indexOf('{/* Recursos */}');
const resEnd = s.indexOf('<ElementsSection', resStart);
if (resStart !== -1 && resEnd !== -1) {
  const replacement = `      {/* Recursos */}
      <SectionCard title="Recursos">
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ['HP', 'hp_current', 'hp', effectiveMaxes.hp, '#8B1E2D'],
              ['Mana', 'mana_current', 'mana', effectiveMaxes.mana, '#3B6EA5'],
              ['Sanidade', 'sanity_current', 'sanity', effectiveMaxes.sanity, '#7A6B9A'],
            ] as const
          ).map(([label, currentKey, modKey, max, color]) => {
            const current = sheet[currentKey];
            const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
            const modVal = sheet.resource_mods[modKey] || 0;
            return (
              <ResourceBlock
                key={currentKey}
                label={label}
                current={current}
                max={max}
                color={color}
                mod={modVal}
                onModChange={(v) =>
                  patch({
                    resource_mods: { ...sheet.resource_mods, [modKey]: v },
                  })
                }
                onApply={(delta) => {
                  const next = Math.max(0, Math.min(max, current + delta));
                  patch({ [currentKey]: next } as Partial<SheetState>);
                }}
              />
            );
          })}
        </div>
      </SectionCard>

      `;
  s = s.slice(0, resStart) + replacement + s.slice(resEnd);
  console.log('resources replaced');
}

// Append ResourceBlock component before ListSection function if missing
if (!s.includes('function ResourceBlock')) {
  s = s.replace(
    'function ListSection({',
    `function ResourceBlock({
  label,
  current,
  max,
  color,
  mod,
  onModChange,
  onApply,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
  mod: number;
  onModChange: (v: number) => void;
  onApply: (delta: number) => void;
}) {
  const [amount, setAmount] = useState(1);
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  return (
    <div className="space-y-2 rounded-md border border-ink-border bg-ink-raised/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          mod
          <input
            type="number"
            step={1}
            className="field w-14 py-1 text-center text-sm"
            value={mod}
            onChange={(e) => onModChange(Math.trunc(Number(e.target.value) || 0))}
            title="Ajuste no máximo"
          />
        </label>
      </div>
      <p className="font-display text-2xl text-parchment">
        {current}
        <span className="text-base text-ink-muted"> / {max}</span>
      </p>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink">
        <div className="h-full transition-all" style={{ width: pct + '%', backgroundColor: color }} />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          step={1}
          className="field w-14 py-1 text-center text-sm"
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
        />
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onApply(-amount)}>
          Dano
        </button>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onApply(amount)}>
          Cura
        </button>
      </div>
    </div>
  );
}

function ListSection({`
  );
  console.log('ResourceBlock added');
}

fs.writeFileSync(p, s);
console.log('sheet mid', {
  res: s.includes('ResourceBlock'),
  mods: s.includes('resource_mods'),
  effective: s.includes('effectiveMaxes'),
});
