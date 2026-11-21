'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Brush, CloudFog, Eye, EyeOff, Pentagon, Square, type LucideIcon } from 'lucide-react';
import type { FogMode, FogShape } from '@/lib/vtt/fog/mask';
import { FOG_BRUSH_MAX, FOG_BRUSH_MIN, useVttStore } from '@/lib/vtt/store';
import { ConfirmDialog } from './ConfirmDialog';
import { IconButton } from './hud';

const SHAPES: { id: FogShape; label: string; icon: LucideIcon }[] = [
  { id: 'brush', label: 'Pincel', icon: Brush },
  { id: 'rect', label: 'Retângulo', icon: Square },
  { id: 'poly', label: 'Polígono', icon: Pentagon },
];

const MODES: { id: FogMode; label: string }[] = [
  { id: 'reveal', label: 'Revelar' },
  { id: 'cover', label: 'Cobrir' },
];

const SHAPE_HINT: Record<FogShape, string> = {
  brush: 'Arraste para pintar. [ e ] mudam o tamanho.',
  rect: 'Arraste para marcar a caixa.',
  poly: 'Clique ponto a ponto. Feche com duplo clique, Enter ou no primeiro ponto. Backspace desfaz um ponto.',
};

function segment(active: boolean): string {
  return (
    'min-h-11 rounded-md px-2 py-1 text-xs transition desk:min-h-0 ' +
    (active ? 'bg-crimson/40 text-parchment' : 'text-ink-muted hover:bg-ink-raised hover:text-parchment')
  );
}

function FogOptions({ popover }: { popover: string }) {
  const shape = useVttStore((s) => s.fogShape);
  const mode = useVttStore((s) => s.fogMode);
  const brush = useVttStore((s) => s.fogBrush);
  const [confirming, setConfirming] = useState<'reveal' | 'cover' | null>(null);

  function fillAll() {
    useVttStore.getState().fogSync?.fillAll(confirming === 'reveal');
    setConfirming(null);
  }

  return (
    <div className={popover + ' max-w-[min(30rem,calc(100vw-1rem))]'}>
      <div role="radiogroup" aria-label="Formato" className="flex items-center gap-0.5">
        {SHAPES.map((item) => (
          <IconButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={shape === item.id}
            onClick={() => useVttStore.setState({ fogShape: item.id })}
          />
        ))}
      </div>
      <div role="radiogroup" aria-label="Revelar ou cobrir" className="flex items-center gap-0.5">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={mode === item.id}
            className={segment(mode === item.id)}
            onClick={() => useVttStore.setState({ fogMode: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>
      {shape === 'brush' && (
        <label className="flex items-center gap-1">
          Tamanho
          <input
            type="range"
            min={FOG_BRUSH_MIN}
            max={FOG_BRUSH_MAX}
            value={brush}
            className="w-24"
            onChange={(e) => useVttStore.setState({ fogBrush: Number(e.target.value) })}
          />
        </label>
      )}
      <button
        type="button"
        className="btn-ghost min-h-11 px-2 py-1 text-xs desk:min-h-0"
        onClick={() => setConfirming('reveal')}
      >
        Revelar tudo
      </button>
      <button
        type="button"
        className="btn-ghost min-h-11 px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60 desk:min-h-0"
        onClick={() => setConfirming('cover')}
      >
        Cobrir tudo
      </button>
      <p className="w-full text-[11px] leading-snug">
        {SHAPE_HINT[shape]} Segure Alt para {mode === 'reveal' ? 'cobrir' : 'revelar'}. Ctrl+Z desfaz.
      </p>
      {/* Portal: a barra tem `transform`, e um `fixed` dentro dela ficaria preso a ela. */}
      {confirming &&
        createPortal(
          <ConfirmDialog
            title={confirming === 'reveal' ? 'Revelar a página inteira?' : 'Cobrir a página inteira?'}
            confirmLabel={confirming === 'reveal' ? 'Revelar tudo' : 'Cobrir tudo'}
            danger={confirming === 'cover'}
            onConfirm={fillAll}
            onCancel={() => setConfirming(null)}
          >
            {confirming === 'reveal'
              ? 'Os jogadores passam a ver o mapa todo. Dá para desfazer com Ctrl+Z.'
              : 'Os jogadores deixam de ver o mapa, menos o próprio token. Dá para desfazer com Ctrl+Z.'}
          </ConfirmDialog>,
          document.body,
        )}
    </div>
  );
}

/** Grupo "Névoa" da barra: só da mestra, e só com a névoa ligada na página. */
export function FogTools({ popover }: { popover: string }) {
  const isGm = useVttStore((s) => s.me?.role === 'mestre');
  const fogOn = useVttStore((s) => s.fogOn);
  const tool = useVttStore((s) => s.tool);
  const playerView = useVttStore((s) => s.fogPlayerView);
  if (!isGm || !fogOn) return null;

  return (
    <>
      <span aria-hidden className="mx-1 h-6 w-px bg-ink-border" />
      <div className="relative">
        <IconButton
          icon={CloudFog}
          label="Névoa"
          active={tool === 'fog'}
          onClick={() => useVttStore.setState({ tool: 'fog', selectedIds: [] })}
        />
        {tool === 'fog' && <FogOptions popover={popover} />}
      </div>
      <IconButton
        icon={playerView ? EyeOff : Eye}
        label={playerView ? 'Voltar à visão da mestra' : 'Ver como jogador'}
        active={playerView}
        onClick={() => useVttStore.setState((s) => ({ fogPlayerView: !s.fogPlayerView }))}
      />
    </>
  );
}
