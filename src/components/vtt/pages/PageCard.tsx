'use client';

import { memo, useState, type DragEvent, type MouseEvent } from 'react';
import { Flag, Folder, Map as MapIcon, MoreHorizontal } from 'lucide-react';
import { libraryImageUrl, type Asset } from '@/lib/vtt/assets/rules';
import { MAX_PAGE_NAME } from '@/lib/vtt/pages';
import type { VttScene } from '@/lib/vtt/types';

/** Tipos do arrastar dentro do overlay: outra página não solta nada aqui por engano. */
export const PAGE_DRAG_TYPE = 'application/x-vtt-page';
export const RIBBON_DRAG_TYPE = 'application/x-vtt-ribbon';

export type DragKind = 'page' | 'ribbon';

export function dragKindOf(event: DragEvent): DragKind | null {
  const types = event.dataTransfer.types;
  if (types.includes(RIBBON_DRAG_TYPE)) return 'ribbon';
  if (types.includes(PAGE_DRAG_TYPE)) return 'page';
  return null;
}

function Thumb({ map }: { map: Asset | null }) {
  const src = map ? libraryImageUrl(map) : null;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- otimizador da Vercel gastaria cota; a URL já tem CDN
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full bg-ink-raised object-cover"
      />
    );
  }
  return (
    <span className="flex h-full w-full items-center justify-center bg-ink-raised text-ink-muted">
      <MapIcon size={32} aria-hidden />
    </span>
  );
}

/** Card de página: miniatura, nome, fita dos jogadores e menu (⋯ ou clique direito). */
export const PageCard = memo(function PageCard({
  scene,
  map,
  hasParty,
  isViewing,
  renaming,
  dropHighlight,
  onOpen,
  onMenu,
  onRename,
  onCancelRename,
  onDragStartPage,
  onDragStartRibbon,
  onDragEnd,
  onDragOverCard,
  onDropCard,
}: {
  scene: VttScene;
  map: Asset | null;
  hasParty: boolean;
  isViewing: boolean;
  renaming: boolean;
  dropHighlight: boolean;
  onOpen: (id: string) => void;
  onMenu: (id: string, x: number, y: number) => void;
  onRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onDragStartPage: (id: string, event: DragEvent) => void;
  onDragStartRibbon: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDragOverCard: (id: string, event: DragEvent) => void;
  onDropCard: (id: string, event: DragEvent) => void;
}) {
  const [draft, setDraft] = useState(scene.name);

  function openMenuAt(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onMenu(scene.id, event.clientX, event.clientY);
  }

  return (
    <li
      draggable={!renaming}
      onDragStart={(event) => onDragStartPage(scene.id, event)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOverCard(scene.id, event)}
      onDrop={(event) => onDropCard(scene.id, event)}
      onContextMenu={openMenuAt}
      className={
        'group relative flex flex-col overflow-hidden rounded-lg border bg-ink-raised/40 ' +
        (dropHighlight
          ? 'border-amber-400 ring-2 ring-amber-400/60 '
          : isViewing
            ? 'border-crimson '
            : 'border-ink-border hover:border-crimson/60 ')
      }
    >
      <button
        type="button"
        className="block aspect-[4/3] w-full overflow-hidden"
        aria-label={`Ir para ${scene.name}`}
        title="Ir para esta página (só você)"
        onClick={() => onOpen(scene.id)}
      >
        <Thumb map={map} />
      </button>

      {hasParty && (
        <span
          draggable
          onDragStart={(event) => {
            event.stopPropagation();
            onDragStartRibbon(event);
          }}
          onDragEnd={onDragEnd}
          title="Os jogadores estão aqui. Arraste a fita para outra página para mover todos."
          className="absolute left-2 top-0 flex cursor-grab items-center gap-1 rounded-b-md bg-amber-400 px-1.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase text-ink shadow-panel"
        >
          <Flag size={12} aria-hidden />
          Jogadores
        </span>
      )}
      {isViewing && (
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-crimson px-1 text-[10px] text-parchment">
          Você está aqui
        </span>
      )}

      <div className="flex items-center gap-1 px-2 py-1.5">
        {renaming ? (
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) onRename(scene.id, draft.trim());
            }}
          >
            <input
              className="field min-h-9 px-1.5 py-0.5 text-xs"
              aria-label="Novo nome da página"
              autoFocus
              maxLength={MAX_PAGE_NAME}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => (draft.trim() && draft.trim() !== scene.name ? onRename(scene.id, draft.trim()) : onCancelRename())}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  onCancelRename();
                }
              }}
            />
          </form>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-parchment" title={scene.name}>
            {scene.name}
          </span>
        )}
        <button
          type="button"
          aria-label={`Opções de ${scene.name}`}
          title="Opções"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-ink-raised hover:text-parchment desk:h-7 desk:w-7 desk:opacity-0 desk:focus-visible:opacity-100 desk:group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onMenu(scene.id, rect.left, rect.bottom + 4);
          }}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </div>
    </li>
  );
});

/** Card de pasta na visão "Todas": abre a pasta e recebe páginas soltas nele. */
export function FolderCard({
  name,
  count,
  dropHighlight,
  onOpen,
  onDragOver,
  onDrop,
}: {
  name: string;
  count: number;
  dropHighlight: boolean;
  onOpen: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}) {
  return (
    <li onDragOver={onDragOver} onDrop={onDrop}>
      <button
        type="button"
        onClick={onOpen}
        className={
          'flex w-full flex-col overflow-hidden rounded-lg border text-left ' +
          (dropHighlight ? 'border-amber-400 ring-2 ring-amber-400/60' : 'border-ink-border hover:border-crimson/60')
        }
      >
        <span className="flex aspect-[4/3] w-full items-center justify-center bg-ink-raised/70 text-ink-muted">
          <Folder size={48} aria-hidden />
        </span>
        <span className="flex items-center gap-1 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm text-parchment">{name}</span>
          <span className="shrink-0 text-xs text-ink-muted">{count}</span>
        </span>
      </button>
    </li>
  );
}
