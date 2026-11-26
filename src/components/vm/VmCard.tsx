'use client';

import Link from 'next/link';
import { memo, useState, type ReactNode } from 'react';
import { ElementSymbol } from '@/components/elements/ElementSymbol';
import { ELEMENT_COLORS, ELEMENT_LABELS, isValidImageUrl } from '@/lib/constants';
import { characterMaxes, elementTags, resourceTone, type ResourceTone } from '@/lib/vm/card';
import type { VmCharacter, VmNpc } from '@/lib/vm/data';
import type { Attributes } from '@/types/database';

/** Ordem do rodapé do card. */
const CARD_ATTRIBUTES: (keyof Attributes)[] = ['FOR', 'DES', 'CON', 'INT', 'EDU', 'POD', 'CAR'];

type ResourceKind = 'hp' | 'mana' | 'sanity';

const RESOURCE_LABEL: Record<ResourceKind, string> = {
  hp: 'Vida',
  mana: 'Mana',
  sanity: 'Sanidade',
};

const RESOURCE_COLOR: Record<ResourceKind, string> = {
  hp: '#E06C75',
  mana: '#6FA8DC',
  sanity: '#B49BD6',
};

const TONE_COLOR: Record<Exclude<ResourceTone, 'normal'>, string> = {
  warn: '#F2C94C',
  danger: '#FF3B3B',
};

function Avatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidImageUrl(url) && !failed;
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-crimson/50 bg-ink-raised">
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url!}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          aria-hidden
          className="flex h-full w-full items-center justify-center font-display text-3xl text-parchment/80"
        >
          {initial}
        </span>
      )}
    </div>
  );
}

function Resource({ kind, current, max }: { kind: ResourceKind; current: number; max: number }) {
  const tone = resourceTone(current, max);
  const color = tone === 'normal' ? RESOURCE_COLOR[kind] : TONE_COLOR[tone];
  return (
    <div className="flex flex-col items-center" title={`${current} / ${max}`}>
      <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink-muted">
        {RESOURCE_LABEL[kind]}
      </span>
      <span
        className="font-display text-3xl font-bold leading-none tabular-nums transition-colors"
        style={{ color }}
      >
        {current}
      </span>
      <span className="sr-only">de {max}</span>
    </div>
  );
}

/** Cor muito escura some no fundo: borda clara no lugar. */
function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 70;
}

function ElementTags({ elements }: { elements: VmCharacter['elements'] }) {
  const tags = elementTags(elements);
  if (!tags.length) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-1.5">
      {tags.map((t) => {
        const color = ELEMENT_COLORS[t.element];
        const dark = isDark(color);
        return (
          <li
            key={t.element}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-parchment"
            style={{
              borderColor: dark ? 'rgba(232,223,208,0.3)' : color,
              backgroundColor: color + (dark ? '99' : '2e'),
            }}
          >
            <ElementSymbol element={t.element} size={14} decorative />
            <span>{ELEMENT_LABELS[t.element]}</span>
            <span className="tabular-nums opacity-80">{t.level}</span>
          </li>
        );
      })}
    </ul>
  );
}

function AttributeRow({ attributes }: { attributes: Attributes }) {
  return (
    <dl className="grid grid-cols-7 gap-1 border-t border-ink-border pt-2 text-center">
      {CARD_ATTRIBUTES.map((key) => (
        <div key={key} className="flex flex-col items-center">
          <dt className="text-[0.6rem] font-medium tracking-[0.1em] text-ink-muted">{key}</dt>
          <dd className="text-sm font-semibold tabular-nums text-parchment">{attributes[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Callbacks estáveis (useCallback/useMemo de quem usa): o memo do card depende disso. */
export interface CardActions {
  move: (memberId: string, dir: -1 | 1) => void;
  remove: (memberId: string) => void;
}

export interface CardPlacement {
  memberId: string;
  first: boolean;
  last: boolean;
  actions: CardActions;
}

function Controls({ memberId, first, last, actions, name }: CardPlacement & { name: string }) {
  const btn =
    'flex h-9 w-9 items-center justify-center rounded-md border border-ink-border bg-ink-panel/95 text-sm text-ink-muted hover:border-crimson/50 hover:text-parchment disabled:opacity-30 desk:h-7 desk:w-7';
  return (
    <>
      <button
        type="button"
        className={btn}
        disabled={first}
        aria-label={`Mover ${name} para trás`}
        title="Mover para trás"
        onClick={() => actions.move(memberId, -1)}
      >
        ←
      </button>
      <button
        type="button"
        className={btn}
        disabled={last}
        aria-label={`Mover ${name} para frente`}
        title="Mover para frente"
        onClick={() => actions.move(memberId, 1)}
      >
        →
      </button>
      <button
        type="button"
        className={btn}
        aria-label={`Tirar ${name} do grupo`}
        title="Tirar do grupo"
        onClick={() => actions.remove(memberId)}
      >
        ✕
      </button>
    </>
  );
}

function CardShell({
  href,
  controls,
  children,
}: {
  href?: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const body = <div className="flex h-full flex-col gap-3 p-4">{children}</div>;
  return (
    <article className="panel group relative transition hover:border-crimson/60">
      {href ? (
        <Link
          href={href}
          prefetch={false}
          className="block h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-crimson/60"
        >
          {body}
        </Link>
      ) : (
        body
      )}
      {controls && (
        <div className="absolute right-2 top-2 flex gap-1 transition desk:opacity-0 desk:focus-within:opacity-100 desk:group-hover:opacity-100">
          {controls}
        </div>
      )}
    </article>
  );
}

function Header({ name, subtitle, imageUrl }: { name: string; subtitle: string | null; imageUrl: string | null }) {
  return (
    <div className="flex items-center gap-3 pr-20">
      <Avatar url={imageUrl} name={name} />
      <div className="min-w-0">
        <h3 className="truncate font-display text-2xl leading-tight text-parchment">{name}</h3>
        {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

export const CharacterCard = memo(function CharacterCard({
  character,
  asNpc,
  ...placement
}: {
  character: VmCharacter;
  asNpc: boolean;
} & CardPlacement) {
  const maxes = characterMaxes(character);
  return (
    <CardShell
      href={`/fichas/${character.id}`}
      controls={<Controls {...placement} name={character.name} />}
    >
      <Header
        name={character.name}
        imageUrl={character.image_url}
        subtitle={asNpc ? 'NPC' : character.ownerName}
      />
      <div className="flex justify-center gap-6">
        <Resource kind="hp" current={character.hp_current} max={maxes.hp} />
        <Resource kind="mana" current={character.mana_current} max={maxes.mana} />
        <Resource kind="sanity" current={character.sanity_current} max={maxes.sanity} />
      </div>
      <ElementTags elements={character.elements} />
      <div className="mt-auto">
        <AttributeRow attributes={character.attributes} />
      </div>
    </CardShell>
  );
});

/** NPC da Mesa: sem página de ficha, então sem clique. */
export const NpcCard = memo(function NpcCard({
  npc,
  ...placement
}: {
  npc: VmNpc;
} & CardPlacement) {
  const subtitle = ['NPC da Mesa', npc.tableName].filter(Boolean).join(' · ');
  return (
    <CardShell controls={<Controls {...placement} name={npc.name} />}>
      <Header name={npc.name} imageUrl={null} subtitle={subtitle} />
      <div className="flex justify-center gap-6">
        <Resource kind="hp" current={npc.hp_current} max={npc.hp_max} />
      </div>
      {npc.tier && (
        <p className="text-center text-xs text-ink-muted">
          {npc.tier} · ND {npc.nd}
        </p>
      )}
      <div className="mt-auto">
        <AttributeRow attributes={npc.attributes} />
      </div>
    </CardShell>
  );
});
