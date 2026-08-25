'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DeleteCharacterButton } from '@/components/character/DeleteCharacterButton';
import { CharacterImage } from '@/components/ui/CharacterImage';

export type CharacterCard = {
  id: string;
  name: string;
  occupation: string | null;
  arcana: string | null;
  imageUrl: string | null;
  level: number;
  isOwner: boolean;
};

export type CharacterGroup = {
  ownerLabel: string;
  cards: CharacterCard[];
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function CharacterBrowser({
  groups,
  showSearch,
}: {
  groups: CharacterGroup[];
  showSearch: boolean;
}) {
  const [term, setTerm] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(term.trim());
    if (!q) return groups;
    const words = q.split(/\s+/);
    return groups
      .map((group) => ({
        ...group,
        cards: group.cards.filter((card) => {
          const haystack = normalize(
            [card.name, card.occupation, card.arcana, group.ownerLabel]
              .filter(Boolean)
              .join(' ')
          );
          return words.every((word) => haystack.includes(word));
        }),
      }))
      .filter((group) => group.cards.length > 0);
  }, [groups, term]);

  const totalFound = filtered.reduce((sum, g) => sum + g.cards.length, 0);

  return (
    <div className="space-y-6">
      {showSearch && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="sr-only">Buscar fichas</span>
            <input
              className="field"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por personagem, jogador, ocupação ou arcana…"
            />
          </label>
          {term.trim() && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <span>
                {totalFound === 1
                  ? '1 ficha encontrada'
                  : totalFound + ' fichas encontradas'}
              </span>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => setTerm('')}
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="panel p-8 text-center text-ink-muted">
          Nenhuma ficha corresponde à busca.
        </div>
      )}

      {filtered.map((group) => (
        <div key={group.ownerLabel || 'own'} className="space-y-3">
          {group.ownerLabel && (
            <h2 className="label text-crimson-soft">{group.ownerLabel}</h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.cards.map((card) => (
              <div
                key={card.id}
                className="panel group relative overflow-hidden transition hover:border-crimson/50"
              >
                <Link href={`/fichas/${card.id}`} className="block">
                  <CharacterImage
                    url={card.imageUrl}
                    name={card.name}
                    className="h-40 w-full"
                  />
                  <div className="space-y-1 p-4 pr-20">
                    <h3 className="font-display text-xl text-parchment group-hover:text-crimson-soft">
                      {card.name}
                    </h3>
                    <p className="text-sm text-ink-muted">
                      Nível {card.level}
                      {card.occupation ? ` · ${card.occupation}` : ''}
                    </p>
                  </div>
                </Link>
                {card.isOwner && (
                  <div className="absolute bottom-3 right-3 z-10">
                    <DeleteCharacterButton
                      characterId={card.id}
                      characterName={card.name}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
