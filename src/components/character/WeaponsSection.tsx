'use client';

import { InlineRollButton } from '@/components/dice/DiceRoller';
import { ListSection } from '@/components/character/ListSection';
import { WEAPON_TYPES } from '@/lib/constants';
import { MAX_WEAPON_MODS } from '@/lib/weapons-reference';
import type { Weapon, WeaponMod } from '@/types/database';

export function WeaponsSection({
  weapons,
  onChange,
}: {
  weapons: Weapon[];
  onChange: (weapons: Weapon[]) => void;
}) {
  return (
    <ListSection
      title="Armas"
      onAdd={() =>
        onChange([
          ...weapons,
          {
            name: 'Nova arma',
            type: 'Corpo a Corpo',
            damage: '1d6',
            ammo: '',
            hitsPerTurn: 1,
            weight: 1,
            range: '',
            flaw: '',
            area: '',
            mods: [],
          },
        ])
      }
    >
      {weapons.map((w, i) => (
        <div
          key={i}
          className="space-y-2 rounded-md border border-ink-border bg-ink-raised/40 p-3"
        >
          <div className="flex flex-wrap gap-2">
            <input
              className="field flex-1"
              value={w.name}
              onChange={(e) => {
                const next = [...weapons];
                next[i] = { ...w, name: e.target.value };
                onChange(next);
              }}
            />
            <input
              className="field w-24"
              placeholder="Dano"
              value={w.damage}
              onChange={(e) => {
                const next = [...weapons];
                next[i] = { ...w, damage: e.target.value };
                onChange(next);
              }}
            />
            <InlineRollButton notation={w.damage || '1d6'} />
            <button
              type="button"
              className="btn-ghost px-2"
              onClick={() => onChange(weapons.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="label">Tipo</span>
              <select
                className="field"
                value={w.type || 'Corpo a Corpo'}
                onChange={(e) => {
                  const next = [...weapons];
                  next[i] = { ...w, type: e.target.value };
                  onChange(next);
                }}
              >
                {WEAPON_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="label">Hits/turno</span>
              <input
                type="number"
                step={1}
                min={0}
                className="field"
                value={w.hitsPerTurn}
                onChange={(e) => {
                  const next = [...weapons];
                  next[i] = {
                    ...w,
                    hitsPerTurn: Math.trunc(Number(e.target.value) || 0),
                  };
                  onChange(next);
                }}
              />
            </label>
            <label className="space-y-1">
              <span className="label">Peso</span>
              <input
                type="number"
                step={1}
                min={0}
                className="field"
                value={w.weight ?? 0}
                onChange={(e) => {
                  const next = [...weapons];
                  next[i] = {
                    ...w,
                    weight: Math.trunc(Number(e.target.value) || 0),
                  };
                  onChange(next);
                }}
              />
            </label>
            {(
              [
                ['ammo', 'Munição'],
                ['range', 'Alcance'],
                ['flaw', 'Defeito'],
                ['area', 'Área'],
              ] as const
            ).map(([key, ph]) => (
              <input
                key={key}
                className="field"
                placeholder={ph}
                value={w[key]}
                onChange={(e) => {
                  const next = [...weapons];
                  next[i] = { ...w, [key]: e.target.value };
                  onChange(next);
                }}
              />
            ))}
          </div>
          <WeaponModsEditor
            mods={w.mods ?? []}
            onChange={(mods) => {
              const next = [...weapons];
              next[i] = { ...w, mods };
              onChange(next);
            }}
          />
        </div>
      ))}
    </ListSection>
  );
}

function WeaponModsEditor({
  mods,
  onChange,
}: {
  mods: WeaponMod[];
  onChange: (mods: WeaponMod[]) => void;
}) {
  const full = mods.length >= MAX_WEAPON_MODS;
  return (
    <div className="space-y-2 border-t border-ink-border pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="label">
          Modificadores ({mods.length}/{MAX_WEAPON_MODS})
        </span>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          disabled={full}
          onClick={() => onChange([...mods, { name: '', description: '' }])}
        >
          + Modificador
        </button>
      </div>
      {mods.map((m, j) => (
        <div key={j} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            className="field"
            placeholder="Nome"
            value={m.name}
            onChange={(e) => {
              const next = [...mods];
              next[j] = { ...m, name: e.target.value };
              onChange(next);
            }}
          />
          <input
            className="field"
            placeholder="Descrição"
            value={m.description}
            onChange={(e) => {
              const next = [...mods];
              next[j] = { ...m, description: e.target.value };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="btn-ghost px-2"
            onClick={() => onChange(mods.filter((_, k) => k !== j))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
