'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, Dices, Minus, Plus, Trash2 } from 'lucide-react';
import {
  CREATURE_TIERS,
  PLANE_LABELS,
  type Plane,
} from '@/lib/vtt/creature-tiers';
import {
  ATTRIBUTE_LABELS,
  buildNpcFromTier,
  clampHp,
  clampNd,
  damageNotation,
  retuneAttacks,
  xPerTurn,
  type Npc,
} from '@/lib/vtt/npc-rules';
import { useVttStore } from '@/lib/vtt/store';
import { IconButton } from './hud';

const PLANES = Object.keys(PLANE_LABELS) as Plane[];

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR');
}

function CreateNpcForm() {
  const sync = useVttStore((s) => s.npcSync);
  const [plane, setPlane] = useState<Plane>('tartaro');
  const tiers = useMemo(
    () => CREATURE_TIERS.filter((tier) => tier.plane === plane),
    [plane]
  );
  const [tierId, setTierId] = useState(tiers[0].id);
  const tier = tiers.find((item) => item.id === tierId) ?? tiers[0];
  const [ndText, setNdText] = useState(String(tier.ndMin));
  const [name, setName] = useState('');
  const nd = clampNd(tier, Number(ndText));
  const preview = buildNpcFromTier(tier, nd);

  function choosePlane(next: Plane) {
    const first = CREATURE_TIERS.find((item) => item.plane === next);
    setPlane(next);
    if (first) {
      setTierId(first.id);
      setNdText(String(first.ndMin));
    }
  }

  function chooseTier(id: string) {
    const next = tiers.find((item) => item.id === id);
    setTierId(id);
    if (next) setNdText(String(next.ndMin));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !sync) return;
    if (await sync.create(name, tier, nd)) setName('');
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-ink-border p-2">
      <input
        className="field px-2 py-1 text-sm"
        placeholder="Nome do NPC"
        aria-label="Nome do NPC"
        maxLength={120}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid grid-cols-[1fr_1fr_4rem] gap-1">
        <select
          className="field px-1 py-1 text-xs"
          aria-label="Plano"
          value={plane}
          onChange={(e) => choosePlane(e.target.value as Plane)}
        >
          {PLANES.map((item) => (
            <option key={item} value={item}>
              {PLANE_LABELS[item]}
            </option>
          ))}
        </select>
        <select
          className="field px-1 py-1 text-xs"
          aria-label="Patamar"
          value={tier.id}
          onChange={(e) => chooseTier(e.target.value)}
        >
          {tiers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="field px-1 py-1 text-xs"
          aria-label={`ND, de ${tier.ndMin} a ${tier.ndMax}`}
          title={`ND de ${tier.ndMin} a ${tier.ndMax}`}
          min={tier.ndMin}
          max={tier.ndMax}
          value={ndText}
          onChange={(e) => setNdText(e.target.value)}
          onBlur={() => setNdText(String(nd))}
        />
      </div>
      <p className="text-xs text-ink-muted">
        ND {nd} (faixa {tier.ndMin}–{tier.ndMax}): HP {preview.hp_max},{' '}
        {damageNotation(preview.damage_die, preview.x_bonus)},{' '}
        {preview.attack_slots.length} ataque(s), {preview.turns} turno(s), XP {preview.xp}
      </p>
      <button
        type="submit"
        className="btn-primary min-h-11 w-full px-2 py-1 text-sm desk:min-h-0"
        disabled={!name.trim()}
      >
        Criar NPC
      </button>
    </form>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="label block">
      {label}
      <input
        type="number"
        className="field mt-0.5 px-1 py-1 text-xs"
        min={min}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          // Campo vazio no meio da digitação não vira 0 no banco.
          if (e.target.value !== '' && Number.isFinite(next)) {
            onChange(Math.round(next));
          }
        }}
      />
    </label>
  );
}

function NpcDetails({ npc, hiddenRolls }: { npc: Npc; hiddenRolls: boolean }) {
  const sync = useVttStore((s) => s.npcSync);
  const chat = useVttStore((s) => s.chat);
  const patch = (changes: Parameters<NonNullable<typeof sync>['update']>[1]) =>
    sync?.update(npc.id, changes);

  function setSlot(index: number, changes: Partial<Npc['attack_slots'][number]>) {
    patch({
      attack_slots: npc.attack_slots.map((slot, i) =>
        i === index ? { ...slot, ...changes } : slot
      ),
    });
  }

  async function rollAttack(index: number) {
    const slot = npc.attack_slots[index];
    const roll = await chat?.roll({
      notation: slot.damage,
      label: `${npc.name} — ${slot.name}`,
      hidden: hiddenRolls,
      actor: npc.name,
    });
    if (!roll) {
      useVttStore
        .getState()
        .showToast(`Não foi possível rolar "${slot.damage}": confira o dano.`);
    }
  }

  return (
    <div className="space-y-2 border-t border-ink-border pt-2">
      <input
        className="field px-2 py-1 text-sm"
        aria-label="Nome"
        maxLength={120}
        value={npc.name}
        onChange={(e) => patch({ name: e.target.value })}
      />

      <div className="grid grid-cols-7 gap-1">
        {ATTRIBUTE_LABELS.map((label, index) => (
          <NumberField
            key={label}
            label={label}
            value={npc.attributes[index] ?? 0}
            onChange={(value) =>
              patch({
                attributes: ATTRIBUTE_LABELS.map((_unused, i) =>
                  i === index ? value : npc.attributes[i] ?? 0
                ),
              })
            }
          />
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1">
        <label className="label block">
          Dado
          <input
            className="field mt-0.5 px-1 py-1 text-xs"
            value={npc.damage_die}
            maxLength={20}
            onChange={(e) =>
              patch({
                damage_die: e.target.value,
                attack_slots: retuneAttacks(npc, e.target.value, npc.x_bonus),
              })
            }
          />
        </label>
        <NumberField
          label="X (rodada)"
          value={npc.x_bonus}
          onChange={(x) =>
            patch({
              x_bonus: x,
              attack_slots: retuneAttacks(npc, npc.damage_die, x),
            })
          }
        />
        <NumberField
          label="Turnos"
          min={1}
          value={npc.turns}
          onChange={(turns) => patch({ turns: Math.max(1, Math.min(20, turns)) })}
        />
        <NumberField label="XP" value={npc.xp} onChange={(xp) => patch({ xp })} />
      </div>
      {npc.turns > 1 && (
        <p className="text-xs text-ink-muted">
          X por turno: {formatNumber(xPerTurn(npc.x_bonus, npc.turns))}
        </p>
      )}

      <ul className="space-y-1">
        {npc.attack_slots.map((slot, index) => (
          <li key={index} className="flex items-center gap-1">
            <input
              className="field min-w-0 flex-1 px-2 py-1 text-xs"
              aria-label="Nome do golpe"
              maxLength={60}
              value={slot.name}
              onChange={(e) => setSlot(index, { name: e.target.value })}
            />
            <input
              className="field w-20 shrink-0 px-2 py-1 text-xs"
              aria-label="Dano"
              maxLength={40}
              value={slot.damage}
              onChange={(e) => setSlot(index, { damage: e.target.value })}
            />
            <IconButton
              icon={Dices}
              label={`Rolar ${slot.name}`}
              tooltip="native"
              onClick={() => void rollAttack(index)}
            />
            <IconButton
              icon={Trash2}
              label={`Tirar ${slot.name}`}
              tooltip="native"
              danger
              onClick={() =>
                patch({ attack_slots: npc.attack_slots.filter((_s, i) => i !== index) })
              }
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn-ghost min-h-11 w-full px-2 py-1 text-xs desk:min-h-0"
        onClick={() =>
          patch({
            attack_slots: [
              ...npc.attack_slots,
              {
                name: `Ataque ${npc.attack_slots.length + 1}`,
                damage: damageNotation(npc.damage_die, npc.x_bonus),
              },
            ],
          })
        }
      >
        Adicionar golpe
      </button>

      <textarea
        className="field px-2 py-1 text-xs"
        aria-label="Notas"
        placeholder="Notas"
        rows={3}
        maxLength={8000}
        value={npc.notes}
        onChange={(e) => patch({ notes: e.target.value })}
      />

      <button
        type="button"
        className="btn-ghost min-h-11 w-full px-2 py-1 text-xs text-crimson-soft desk:min-h-0"
        onClick={() => {
          if (window.confirm(`Apagar ${npc.name}? Os tokens vinculados continuam no mapa.`)) {
            void sync?.remove(npc.id);
          }
        }}
      >
        Apagar NPC
      </button>
    </div>
  );
}

function NpcCard({ npc, hiddenRolls }: { npc: Npc; hiddenRolls: boolean }) {
  const sync = useVttStore((s) => s.npcSync);
  const [open, setOpen] = useState(false);
  const changeHp = (next: number) =>
    sync?.update(npc.id, { hp_current: clampHp(next, npc.hp_max) });
  const Chevron = open ? ChevronDown : ChevronRight;
  const tierName = CREATURE_TIERS.find((tier) => tier.id === npc.tier)?.name;

  return (
    <li className="space-y-1 rounded-md border border-ink-border p-2">
      <button
        type="button"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-1 text-left text-sm text-parchment desk:min-h-0"
        onClick={() => setOpen(!open)}
      >
        <Chevron size={14} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{npc.name}</span>
        <span className="shrink-0 text-xs text-ink-muted">
          {tierName ? `${tierName} · ` : ''}ND {npc.nd}
        </span>
      </button>
      <div className="flex items-center gap-1">
        <IconButton
          icon={Minus}
          label="Tirar 1 de HP"
          tooltip="native"
          onClick={() => changeHp(npc.hp_current - 1)}
        />
        <input
          type="number"
          className="field w-16 px-1 py-1 text-center text-sm"
          aria-label="HP atual"
          min={0}
          max={npc.hp_max}
          value={npc.hp_current}
          onChange={(e) => {
            if (e.target.value !== '') changeHp(Number(e.target.value));
          }}
        />
        <IconButton
          icon={Plus}
          label="Somar 1 de HP"
          tooltip="native"
          onClick={() => changeHp(npc.hp_current + 1)}
        />
        <span className="text-xs text-ink-muted">/</span>
        <input
          type="number"
          className="field w-16 px-1 py-1 text-center text-sm"
          aria-label="HP máximo"
          min={0}
          value={npc.hp_max}
          onChange={(e) => {
            if (e.target.value === '') return;
            const max = Math.max(0, Math.round(Number(e.target.value)));
            sync?.update(npc.id, {
              hp_max: max,
              hp_current: clampHp(npc.hp_current, max),
            });
          }}
        />
      </div>
      {open && <NpcDetails npc={npc} hiddenRolls={hiddenRolls} />}
    </li>
  );
}

export function NpcPanel() {
  const npcs = useVttStore((s) => s.npcs);
  const error = useVttStore((s) => s.npcError);
  const [hiddenRolls, setHiddenRolls] = useState(true);
  const list = Object.values(npcs).sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

  return (
    <div className="flex flex-col gap-3">
      <CreateNpcForm />
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          className="h-4 w-4 accent-crimson"
          checked={hiddenRolls}
          onChange={(e) => setHiddenRolls(e.target.checked)}
        />
        Rolar ataques escondido
      </label>
      {list.length === 0 && !error ? (
        <p className="text-sm text-ink-muted">
          Nenhum NPC ainda. Crie acima e vincule a um token pelo menu do token.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((npc) => (
            <NpcCard key={npc.id} npc={npc} hiddenRolls={hiddenRolls} />
          ))}
        </ul>
      )}
    </div>
  );
}
