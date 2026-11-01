'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Link2,
  Link2Off,
  RotateCcw,
  RotateCw,
  Skull,
  Sparkle,
  Swords,
  Trash2,
  Type,
  Undo,
  WandSparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { conditionsForKind } from '@/lib/vtt/conditions';
import { supportsEffects } from '@/lib/vtt/fx/rules';
import { canDeleteObject } from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';
import { ConditionsMenu } from './ConditionsMenu';
import { SpellsMenu, TokenEffectsMenu } from './EffectsMenus';

const QUARTER_TURN = Math.PI / 2;

function Item({
  icon: Icon,
  label,
  danger,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        'flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-ink desk:min-h-8 ' +
        (danger ? 'text-crimson-soft' : 'text-parchment')
      }
    >
      <Icon size={15} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-xs text-ink-muted">{hint}</span>}
    </button>
  );
}

function Separator() {
  return <hr className="my-1 border-ink-border" />;
}

/**
 * Em DOM, não no canvas: precisa de foco, leitor de tela e alvo grande no touch.
 * O que ainda não existe (efeitos, vínculo de ficha) só entra quando chegar.
 */
export function TokenContextMenu() {
  const menu = useVttStore((s) => s.contextMenu);
  const object = useVttStore((s) =>
    s.contextMenu ? s.objects[s.contextMenu.id] : undefined
  );
  const me = useVttStore((s) => s.me);
  const sync = useVttStore((s) => s.sync);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [view, setView] = useState<'main' | 'conditions' | 'spells' | 'effects'>('main');

  const open = Boolean(menu && object);

  useEffect(() => setView('main'), [menu]);

  useEffect(() => {
    if (!open) return;
    const close = () => useVttStore.setState({ contextMenu: null });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // Mantém o menu inteiro na tela, mesmo aberto perto da borda.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const { offsetWidth, offsetHeight } = ref.current;
    setPosition({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - offsetWidth - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - offsetHeight - 8)),
    });
  }, [menu, view]);

  if (!menu || !object || !me || !sync) return null;

  const isGm = me.role === 'mestre';
  const { id } = object;
  const run = (action: () => void) => () => {
    action();
    useVttStore.setState({ contextMenu: null });
  };

  const { kind } = object;
  const backToMain = () => setView('main');

  if (view !== 'main') {
    return (
      <div
        ref={ref}
        role="menu"
        aria-label={
          view === 'conditions'
            ? 'Condições do token'
            : view === 'spells'
              ? 'Magias do token'
              : 'Efeitos do token'
        }
        className="fixed z-50 max-h-[85vh] w-64 overflow-y-auto rounded-xl border border-ink-border bg-ink-raised p-1 shadow-panel"
        style={position}
        onContextMenu={(e) => e.preventDefault()}
      >
        {view === 'conditions' && <ConditionsMenu object={object} onBack={backToMain} />}
        {view === 'spells' && supportsEffects(kind) && (
          <SpellsMenu object={object} target={kind} onBack={backToMain} />
        )}
        {view === 'effects' && <TokenEffectsMenu object={object} onBack={backToMain} />}
      </div>
    );
  }

  const isToken = kind === 'token';

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Ações do token"
      className="fixed z-50 max-h-[85vh] w-56 overflow-y-auto rounded-xl border border-ink-border bg-ink-raised p-1 shadow-panel"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Item
        icon={FlipHorizontal2}
        label="Espelhar na horizontal"
        onClick={run(() => sync.flipX(id))}
      />
      <Item
        icon={FlipVertical2}
        label="Espelhar na vertical"
        onClick={run(() => sync.flipY(id))}
      />
      <Item
        icon={RotateCcw}
        label="Girar à esquerda"
        hint="Q"
        onClick={run(() => sync.rotateBy(id, -QUARTER_TURN))}
      />
      <Item
        icon={RotateCw}
        label="Girar à direita"
        hint="E"
        onClick={run(() => sync.rotateBy(id, QUARTER_TURN))}
      />
      <Item
        icon={Undo}
        label="Tamanho original"
        onClick={run(() => sync.resetTransform(id))}
      />
      <Separator />
      <Item
        icon={Type}
        label="Legenda…"
        onClick={run(() => useVttStore.setState({ captionTargetId: id }))}
      />
      {object.parent_id ? (
        <Item
          icon={Link2Off}
          label="Desanexar"
          onClick={run(() => sync.detach(id))}
        />
      ) : (
        <Item
          icon={Link2}
          label="Anexar a…"
          onClick={run(() =>
            useVttStore.setState({ attachingId: id, tool: 'select' })
          )}
        />
      )}
      <Separator />
      <Item
        icon={ArrowUpToLine}
        label="Trazer pra frente"
        onClick={run(() => sync.bringToFront(id))}
      />
      <Item
        icon={ArrowDownToLine}
        label="Mandar pra trás"
        onClick={run(() => sync.sendToBack(id))}
      />
      <Item
        icon={Copy}
        label="Duplicar"
        hint="Ctrl+C / V"
        onClick={run(() => void sync.duplicateObject(id))}
      />
      {conditionsForKind(kind).length > 0 && (
        <Item
          icon={Zap}
          label="Condições"
          hint="▸"
          onClick={() => setView('conditions')}
        />
      )}
      {supportsEffects(kind) && (
        <>
          <Item
            icon={WandSparkles}
            label="Magias"
            hint="▸"
            onClick={() => setView('spells')}
          />
          <Item
            icon={Sparkle}
            label="Efeitos"
            hint="▸"
            onClick={() => setView('effects')}
          />
        </>
      )}
      {isGm && (
        <>
          <Separator />
          {isToken && (
            <>
              <Item
                icon={Skull}
                label="Vincular NPC…"
                onClick={run(() => useVttStore.setState({ npcLinkTargetId: id }))}
              />
              <Item
                icon={Swords}
                label="Adicionar à iniciativa"
                onClick={run(
                  () => void useVttStore.getState().initiativeSync?.addObjects([id])
                )}
              />
            </>
          )}
          <Item
            icon={object.hidden ? Eye : EyeOff}
            label={object.hidden ? 'Mostrar' : 'Ocultar'}
            onClick={run(() => void sync.setHidden(id, !object.hidden))}
          />
        </>
      )}
      {canDeleteObject(object, me.role, me.userId) && (
        <>
          <Separator />
          <Item
            icon={Trash2}
            label="Apagar"
            danger
            hint="Del"
            onClick={run(() => void sync.deleteObject(id))}
          />
        </>
      )}
    </div>
  );
}
