'use client';

import { useState, type FormEvent } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import {
  conditionsForKind,
  CUSTOM_EMOJI_CHOICES,
  customCondition,
  MAX_CUSTOM_CONDITION_LENGTH,
  resolveCondition,
  resolveConditions,
  sanitizeEmoji,
} from '@/lib/vtt/conditions';
import { useVttStore } from '@/lib/vtt/store';
import type { SceneObject } from '@/lib/vtt/types';
import { ConditionIcon } from './ConditionIcon';

const ROW =
  'flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm text-parchment hover:bg-ink desk:min-h-8';

function ConditionRow({
  conditionKey,
  active,
  onToggle,
}: {
  conditionKey: string;
  active: boolean;
  onToggle: () => void;
}) {
  const condition = resolveCondition(conditionKey);
  if (!condition) return null;
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={active}
      className={ROW}
      title={condition.label}
      onClick={onToggle}
    >
      <ConditionIcon condition={condition} />
      <span className="min-w-0 flex-1 truncate">{condition.label}</span>
      {active && <Check size={14} aria-hidden className="shrink-0 text-crimson-soft" />}
    </button>
  );
}

/**
 * Fica aberto ao ligar: é comum marcar mais de uma condição de uma vez. Com vários
 * objetos (Fase 12b), marcada = todos têm; tocar liga em todos se algum não tem.
 */
export function ConditionsMenu({
  objects,
  onBack,
}: {
  objects: SceneObject[];
  onBack: () => void;
}) {
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(CUSTOM_EMOJI_CHOICES[0]);
  const sync = useVttStore((s) => s.sync);
  const ids = objects.map((object) => object.id);
  const allHave = (key: string) => objects.every((object) => object.conditions.includes(key));
  const toggle = (key: string) =>
    ids.length === 1 ? sync?.toggleCondition(ids[0], key) : sync?.toggleConditionMany(ids, key);
  // Só o que vale para todos os tipos da seleção (addon tem menos condições que token).
  const kinds = Array.from(new Set(objects.map((object) => object.kind)));
  const standard = conditionsForKind(kinds[0]).filter(({ id }) =>
    kinds.every((kind) => conditionsForKind(kind).some((condition) => condition.id === id))
  );
  const customKeys = Array.from(new Set(objects.flatMap((object) => object.conditions)));
  const customs = resolveConditions(customKeys).filter((c) => c.emoji);

  function addCustom(event: FormEvent) {
    event.preventDefault();
    const key = customCondition(text, emoji);
    if (!key) {
      useVttStore.getState().showToast('Escreva um nome e escolha um emoji.');
      return;
    }
    if (!allHave(key)) toggle(key);
    setText('');
  }

  return (
    <>
      <button type="button" className={ROW + ' font-medium'} onClick={onBack}>
        <ChevronLeft size={15} aria-hidden className="shrink-0" />
        Condições
      </button>
      <hr className="my-1 border-ink-border" />
      {standard.map(({ id }) => (
        <ConditionRow key={id} conditionKey={id} active={allHave(id)} onToggle={() => toggle(id)} />
      ))}
      {customs.map(({ key }) => (
        <ConditionRow key={key} conditionKey={key} active={allHave(key)} onToggle={() => toggle(key)} />
      ))}
      <hr className="my-1 border-ink-border" />
      <form onSubmit={addCustom} className="space-y-2 p-2">
        <label className="label block" htmlFor="custom-condition">
          Personalizada…
        </label>
        <input
          id="custom-condition"
          className="field px-2 py-1 text-sm"
          placeholder="Nome curto"
          maxLength={MAX_CUSTOM_CONDITION_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="grid grid-cols-8 gap-0.5" role="radiogroup" aria-label="Emoji">
          {CUSTOM_EMOJI_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={emoji === choice}
              aria-label={choice}
              className={
                'flex h-7 items-center justify-center rounded text-sm ' +
                (emoji === choice ? 'bg-crimson/40' : 'hover:bg-ink')
              }
              onClick={() => setEmoji(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="field w-16 px-2 py-1 text-center text-sm"
            aria-label="Outro emoji"
            title="Outro emoji"
            value={emoji}
            onChange={(e) => setEmoji(sanitizeEmoji(e.target.value) ?? e.target.value)}
          />
          <button type="submit" className="btn-primary flex-1 px-2 py-1 text-sm">
            Adicionar
          </button>
        </div>
      </form>
    </>
  );
}
