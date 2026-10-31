'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canDeleteObject } from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';

const QUARTER_TURN = Math.PI / 2;

function Item({
  label,
  disabled,
  danger,
  hint,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={
        'flex min-h-11 w-full items-center justify-between gap-4 rounded px-2 text-left text-sm desk:min-h-8 ' +
        (disabled
          ? 'cursor-not-allowed text-ink-muted/60'
          : (danger ? 'text-crimson-soft ' : 'text-parchment ') + 'hover:bg-ink')
      }
    >
      {label}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </button>
  );
}

function Separator() {
  return <hr className="my-1 border-ink-border" />;
}

/** Em DOM, não no canvas: precisa de foco, leitor de tela e alvo grande no touch. */
export function TokenContextMenu() {
  const menu = useVttStore((s) => s.contextMenu);
  const object = useVttStore((s) =>
    s.contextMenu ? s.objects[s.contextMenu.id] : undefined
  );
  const me = useVttStore((s) => s.me);
  const sync = useVttStore((s) => s.sync);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const open = Boolean(menu && object);

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
  }, [menu]);

  if (!menu || !object || !me || !sync) return null;

  const isGm = me.role === 'mestre';
  const { id } = object;
  const run = (action: () => void) => () => {
    action();
    useVttStore.setState({ contextMenu: null });
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Ações do token"
      className="fixed z-50 max-h-[85vh] w-60 overflow-y-auto rounded-md border border-ink-border bg-ink-raised p-1 shadow-xl"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Item label="Espelhar horizontal" onClick={run(() => sync.flipX(id))} />
      <Item label="Espelhar vertical" onClick={run(() => sync.flipY(id))} />
      <Item
        label="Girar 90° à esquerda"
        hint="Q"
        onClick={run(() => sync.rotateBy(id, -QUARTER_TURN))}
      />
      <Item
        label="Girar 90° à direita"
        hint="E"
        onClick={run(() => sync.rotateBy(id, QUARTER_TURN))}
      />
      <Item
        label="Resetar rotação/tamanho"
        onClick={run(() => sync.resetTransform(id))}
      />
      <Separator />
      <Item
        label="Legenda…"
        onClick={run(() => useVttStore.setState({ captionTargetId: id }))}
      />
      <Item label="Efeitos ▸" disabled hint="fase 6" />
      <Item label="Magias ▸" disabled hint="fase 6" />
      <Item label="Condições ▸" disabled hint="fase 5" />
      <Separator />
      {object.parent_id ? (
        <Item label="Desanexar" onClick={run(() => sync.detach(id))} />
      ) : (
        <Item
          label="Anexar a…"
          onClick={run(() =>
            useVttStore.setState({ attachingId: id, tool: 'select' })
          )}
        />
      )}
      <Item label="Trazer pra frente" onClick={run(() => sync.bringToFront(id))} />
      <Item label="Mandar pra trás" onClick={run(() => sync.sendToBack(id))} />
      {isGm && (
        <>
          <Separator />
          <Item
            label={object.hidden ? 'Mostrar' : 'Ocultar'}
            onClick={run(() => void sync.setHidden(id, !object.hidden))}
          />
          <Item label="Vincular ficha…" disabled hint="fase 5" />
          <Item label="Vincular NPC…" disabled hint="fase 5" />
        </>
      )}
      {canDeleteObject(object, me.role, me.userId) && (
        <>
          <Separator />
          <Item
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
