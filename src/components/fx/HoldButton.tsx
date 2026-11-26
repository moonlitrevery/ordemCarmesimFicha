'use client';

/**
 * Segurar para confirmar (Fase 15, item 12): ~1 s segurando, a barra carmesim
 * enche; soltou antes, cancela. Mouse, toque e teclado (segurar Enter ou Espaço).
 *
 * Origem: kokonutui, "Hold Button" (components/kokonutui/hold-button.tsx),
 * https://kokonutui.com/docs/buttons/hold-button — licença MIT
 * (https://github.com/kokonut-labs/kokonutui/blob/main/LICENSE).
 *
 * Adaptado: sem class-variance-authority nem variantes do kit; a barra é uma
 * transição CSS de `transform: scaleX` (não depende do LazyMotion, então serve na
 * ficha, na V.M. e na Mesa). A duração do segurar é fixa (é o tempo da
 * confirmação, não enfeite): com movimento reduzido a barra continua enchendo.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

export const HOLD_MS = 1000;

export function HoldButton({
  label,
  holdingLabel = 'Segure…',
  onConfirm,
  disabled = false,
  className = '',
  fillClassName = 'bg-crimson/55',
  title = 'Segure para confirmar',
  children,
}: {
  label: string;
  holdingLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Aparência do botão (ex.: `btn-primary`, item de menu). */
  className?: string;
  fillClassName?: string;
  title?: string;
  /** Conteúdo visível no lugar do texto (botão de ícone); `label` vira só o nome acessível. */
  children?: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || timerRef.current) return;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setHolding(false);
      confirmRef.current();
    }, HOLD_MS);
  }, [disabled]);

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    // Captura: escorregar o dedo para fora não solta; só levantar.
    event.currentTarget.setPointerCapture(event.pointerId);
    start();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Sem o clique nativo do Enter/Espaço: só vale segurando.
    event.preventDefault();
    if (!event.repeat) start();
  }

  function onKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') cancel();
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={`${label} (segure por 1 segundo)`}
      onPointerDown={onPointerDown}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={cancel}
      // Segurar no celular não abre o menu do sistema nem seleciona texto.
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.preventDefault()}
      className={'relative select-none overflow-hidden [-webkit-touch-callout:none] ' + className}
    >
      <span
        aria-hidden
        className={'pointer-events-none absolute inset-0 origin-left ' + fillClassName}
        style={{
          transform: holding ? 'scaleX(1)' : 'scaleX(0)',
          transition: holding
            ? `transform ${HOLD_MS}ms linear`
            : 'transform var(--dur-base) var(--ease-exit)',
        }}
      />
      <span className="relative">{children ?? (holding ? holdingLabel : label)}</span>
    </button>
  );
}
