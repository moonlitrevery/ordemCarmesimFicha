'use client';

import { canEditObjects } from '@/lib/vtt/scene-rules';
import { useVttStore, type VttTool } from '@/lib/vtt/store';

const TOOLS: { id: VttTool; label: string; icon: string; edit: boolean }[] = [
  { id: 'select', label: 'Selecionar', icon: '↖', edit: true },
  { id: 'draw', label: 'Desenhar', icon: '✎', edit: true },
  { id: 'erase', label: 'Borracha', icon: '⌫', edit: true },
  { id: 'ruler', label: 'Régua', icon: '📏', edit: false },
  { id: 'ping', label: 'Ping', icon: '◎', edit: false },
];

const BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-md text-lg transition desk:h-9 desk:w-9 desk:text-base ';

/** Compacta: embaixo no touch, na lateral com mouse. */
export function MapToolbar() {
  const role = useVttStore((s) => s.me?.role);
  const tool = useVttStore((s) => s.tool);
  const strokeColor = useVttStore((s) => s.strokeColor);
  const strokeWidth = useVttStore((s) => s.strokeWidth);
  const lightMode = useVttStore((s) => s.lightMode);
  const setLightMode = useVttStore((s) => s.setLightMode);
  const isGm = role === 'mestre';
  const canEdit = Boolean(role && canEditObjects(role));
  const drawingCount = useVttStore((s) =>
    tool === 'draw' || tool === 'erase' ? Object.keys(s.drawings).length : 0
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex flex-col items-center gap-2 desk:inset-x-auto desk:bottom-auto desk:left-2 desk:top-14 desk:flex-row desk:items-start">
      <div
        role="toolbar"
        aria-label="Ferramentas do mapa"
        className="pointer-events-auto order-2 flex gap-1 rounded-lg border border-ink-border bg-ink-raised/95 p-1 desk:order-1 desk:flex-col"
      >
        {TOOLS.filter((t) => canEdit || !t.edit).map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            className={
              BUTTON +
              (tool === t.id
                ? 'bg-crimson/40 text-parchment'
                : 'text-ink-muted hover:bg-ink hover:text-parchment')
            }
            onClick={() => useVttStore.setState({ tool: t.id, selectedId: null })}
          >
            {t.icon}
          </button>
        ))}
        <button
          type="button"
          title="Modo leve"
          aria-label="Modo leve"
          aria-pressed={lightMode}
          className={
            BUTTON +
            (lightMode
              ? 'bg-emerald-500/30 text-parchment'
              : 'text-ink-muted hover:bg-ink hover:text-parchment')
          }
          onClick={() => setLightMode(!lightMode)}
        >
          ⚡
        </button>
      </div>

      {(tool === 'draw' || tool === 'erase') && canEdit && (
        <div className="pointer-events-auto order-1 flex items-center gap-2 rounded-lg border border-ink-border bg-ink-raised/95 px-2 py-1 text-xs text-ink-muted desk:order-2">
          {tool === 'draw' && (
            <>
              <label className="flex items-center gap-1">
                Cor
                <input
                  type="color"
                  value={strokeColor}
                  className="h-7 w-8 cursor-pointer bg-transparent"
                  onChange={(e) =>
                    useVttStore.setState({ strokeColor: e.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-1">
                Espessura
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={strokeWidth}
                  className="w-20"
                  onChange={(e) =>
                    useVttStore.setState({ strokeWidth: Number(e.target.value) })
                  }
                />
              </label>
            </>
          )}
          {tool === 'erase' && <span>Apaga só os seus traços.</span>}
          {isGm && drawingCount > 0 && (
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60"
              onClick={() => void useVttStore.getState().sync?.clearDrawings()}
            >
              Apagar todos os desenhos da cena
            </button>
          )}
        </div>
      )}
    </div>
  );
}
