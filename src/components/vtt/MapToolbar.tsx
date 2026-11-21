'use client';

import {
  Crosshair,
  Eraser,
  Hand,
  MousePointer2,
  Pencil,
  Redo2,
  Ruler,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { canEditObjects } from '@/lib/vtt/scene-rules';
import { useVttStore, type VttTool } from '@/lib/vtt/store';
import { FLOATING, FLOATING_PANEL, IconButton } from './hud';

const TOOLS: { id: VttTool; label: string; icon: LucideIcon; edit: boolean }[] = [
  { id: 'select', label: 'Selecionar', icon: MousePointer2, edit: true },
  { id: 'pan', label: 'Mover mapa', icon: Hand, edit: false },
  { id: 'draw', label: 'Desenhar', icon: Pencil, edit: true },
  { id: 'erase', label: 'Borracha', icon: Eraser, edit: true },
  { id: 'ruler', label: 'Régua', icon: Ruler, edit: false },
  { id: 'ping', label: 'Ping', icon: Crosshair, edit: false },
];

const POPOVER =
  FLOATING_PANEL +
  ' absolute left-1/2 top-full z-30 mt-2 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-muted';

function ClearDrawingsButton() {
  const count = useVttStore((s) => Object.keys(s.drawings).length);
  if (count === 0) return null;
  return (
    <button
      type="button"
      className="btn-ghost min-h-11 px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60 desk:min-h-0"
      onClick={() => void useVttStore.getState().sync?.clearDrawings()}
    >
      Apagar todos da cena
    </button>
  );
}

function DrawOptions({ isGm }: { isGm: boolean }) {
  const strokeColor = useVttStore((s) => s.strokeColor);
  const strokeWidth = useVttStore((s) => s.strokeWidth);
  return (
    <div className={POPOVER}>
      <label className="flex items-center gap-1">
        Cor
        <input
          type="color"
          value={strokeColor}
          className="h-7 w-8 cursor-pointer bg-transparent"
          onChange={(e) => useVttStore.setState({ strokeColor: e.target.value })}
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
      {isGm && <ClearDrawingsButton />}
    </div>
  );
}

function EraseOptions({ isGm }: { isGm: boolean }) {
  return (
    <div className={POPOVER}>
      <span>Apaga só os seus traços.</span>
      {isGm && <ClearDrawingsButton />}
    </div>
  );
}

/** Só aparece enquanto falta calibrar: medir sem escala não diz nada em metros. */
function RulerHint({ isGm }: { isGm: boolean }) {
  const calibrated = useVttStore((s) =>
    Boolean(s.scenes.find((scene) => scene.id === s.viewedSceneId)?.meters_per_px)
  );
  if (calibrated) return null;
  return (
    <div className={POPOVER}>
      {isGm ? (
        <>
          <span>Régua não calibrada.</span>
          <button
            type="button"
            className="btn-primary min-h-11 px-2 py-1 text-xs desk:min-h-0"
            onClick={() => useVttStore.getState().startCalibration()}
          >
            Calibrar agora
          </button>
        </>
      ) : (
        <span>A mestra ainda não calibrou a régua desta página.</span>
      )}
    </div>
  );
}

/** Flutua no topo, centralizada; as opções ficam coladas à ferramenta ativa. */
export function MapToolbar() {
  const role = useVttStore((s) => s.me?.role);
  const tool = useVttStore((s) => s.tool);
  const canUndo = useVttStore((s) => s.canUndo);
  const canRedo = useVttStore((s) => s.canRedo);
  const sync = useVttStore((s) => s.sync);
  const isGm = role === 'mestre';
  const canEdit = Boolean(role && canEditObjects(role));

  return (
    <div
      role="toolbar"
      aria-label="Ferramentas do mapa"
      className={
        FLOATING +
        // Centrada no que sobra do mapa ao lado da barra direita; no desktop, nunca por
        // cima do título da mesa, no canto esquerdo.
        ' absolute left-[calc((100%_-_var(--vtt-right,0px))/2)] top-16 z-20 flex -translate-x-1/2 items-center gap-0.5 p-1 desk:left-[max(calc((100%_-_var(--vtt-right,0px))/2),30rem)] desk:top-2'
      }
    >
      {TOOLS.filter((t) => canEdit || !t.edit).map((t) => (
        <div key={t.id} className="relative">
          <IconButton
            icon={t.icon}
            label={t.label}
            active={tool === t.id}
            onClick={() => useVttStore.setState({ tool: t.id, selectedIds: [] })}
          />
          {tool === t.id && t.id === 'draw' && <DrawOptions isGm={isGm} />}
          {tool === t.id && t.id === 'erase' && <EraseOptions isGm={isGm} />}
          {tool === t.id && t.id === 'ruler' && <RulerHint isGm={isGm} />}
        </div>
      ))}
      {canEdit && (
        <>
          <span aria-hidden className="mx-1 h-6 w-px bg-ink-border" />
          <IconButton
            icon={Undo2}
            label="Desfazer (Ctrl+Z)"
            disabled={!canUndo}
            onClick={() => void sync?.undo()}
          />
          <IconButton
            icon={Redo2}
            label="Refazer (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={() => void sync?.redo()}
          />
        </>
      )}
    </div>
  );
}
