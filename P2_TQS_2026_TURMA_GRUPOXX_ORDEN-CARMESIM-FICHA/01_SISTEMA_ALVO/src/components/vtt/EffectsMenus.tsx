'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import { EFFECT_COLORS, TOKEN_EFFECTS } from '@/lib/vtt/fx/presets';
import { effectKey, parseEffects, type EffectEntry } from '@/lib/vtt/fx/rules';
import { searchSpells, SPELLS, type SpellTarget } from '@/lib/vtt/fx/spells';
import { useVttStore } from '@/lib/vtt/store';
import type { SceneObject } from '@/lib/vtt/types';
import { useIsDesk } from './hud';

const ROW =
  'flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm text-parchment hover:bg-ink desk:min-h-8';

const TARGET_LABEL: Record<SpellTarget, string> = {
  token: 'token',
  addon: 'addon',
};

function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <>
      <button type="button" className={ROW + ' font-medium'} onClick={onBack}>
        <ChevronLeft size={15} aria-hidden className="shrink-0" />
        {label}
      </button>
      <hr className="my-1 border-ink-border" />
    </>
  );
}

function ToggleRow({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={active}
      className={ROW}
      onClick={onToggle}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check size={14} aria-hidden className="shrink-0 text-crimson-soft" />}
    </button>
  );
}

/**
 * Busca em todas as magias da lista. Magia de outro tipo de alvo não liga aqui,
 * mas a busca a encontra e diz onde ela funciona.
 */
export function SpellsMenu({
  object,
  target,
  onBack,
}: {
  object: SceneObject;
  target: SpellTarget;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const sync = useVttStore((s) => s.sync);
  const isDesk = useIsDesk();

  const active = useMemo(
    () => new Set(parseEffects(object.effects).map(effectKey)),
    [object.effects]
  );
  const found = searchSpells(query);
  const usable = found.filter((spell) => spell.appliesTo === target);
  const elsewhere = found.filter((spell) => spell.appliesTo !== target);

  return (
    <>
      <BackRow label="Magias" onBack={onBack} />
      <div className="p-1">
        <input
          // Com teclado na tela, abrir a lista não deve cobrir metade dela.
          autoFocus={isDesk}
          type="search"
          className="field px-2 py-1 text-sm"
          placeholder={`Buscar entre ${SPELLS.length} magias`}
          aria-label="Buscar magia"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {usable.map((spell) => {
        const entry: EffectEntry = { type: 'spell', id: spell.id };
        return (
          <ToggleRow
            key={spell.id}
            label={spell.name}
            active={active.has(effectKey(entry))}
            onToggle={() => sync?.toggleEffect(object.id, entry)}
          />
        );
      })}
      {query.trim() &&
        elsewhere.map((spell) => (
          <p key={spell.id} className="px-2 py-1 text-xs text-ink-muted">
            {spell.name} só funciona em {TARGET_LABEL[spell.appliesTo]}: abra o menu de um{' '}
            {TARGET_LABEL[spell.appliesTo]}.
          </p>
        ))}
      {found.length === 0 && (
        <p className="px-2 py-2 text-xs text-ink-muted">
          Nenhuma magia com esse nome. Confira a escrita ou limpe a busca.
        </p>
      )}
      {!query.trim() && usable.length === 0 && (
        <p className="px-2 py-2 text-xs text-ink-muted">
          Nenhuma magia para este tipo de objeto. Busque pelo nome para ver onde ela funciona.
        </p>
      )}
    </>
  );
}

/** Fica aberto ao ligar: é comum combinar mais de um. */
export function TokenEffectsMenu({
  object,
  onBack,
}: {
  object: SceneObject;
  onBack: () => void;
}) {
  const sync = useVttStore((s) => s.sync);
  const entries = parseEffects(object.effects);

  return (
    <>
      <BackRow label="Efeitos" onBack={onBack} />
      {TOKEN_EFFECTS.map((preset) => {
        const entry: EffectEntry = { type: 'effect', id: preset.id };
        const current = entries.find((other) => effectKey(other) === effectKey(entry));
        const chosen = current?.color ?? preset.defaultColor;
        return (
          <div key={preset.id}>
            <ToggleRow
              label={preset.label}
              active={Boolean(current)}
              onToggle={() => sync?.toggleEffect(object.id, entry)}
            />
            {current && preset.colorable && (
              <div
                role="radiogroup"
                aria-label={`Cor: ${preset.label}`}
                className="grid grid-cols-8 gap-1 px-2 pb-2"
              >
                {EFFECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={chosen === color}
                    aria-label={color}
                    className={
                      'h-7 rounded border-2 ' +
                      (chosen === color ? 'border-parchment' : 'border-transparent')
                    }
                    style={{ backgroundColor: color }}
                    onClick={() => sync?.setEffectColor(object.id, entry, color)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
