'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Ear, EyeOff, X } from 'lucide-react';
import { m, type TargetAndTransition } from 'framer-motion';
import { singleDieOutcome } from '@/lib/dice';
import { DUR, EASE_ENTER, EASE_EXIT } from '@/lib/motion-tokens';
import {
  buildWhisperTargets,
  chatSuggestions,
} from '@/lib/vtt/chat-commands';
import {
  canDeleteMessage,
  isChatRoll,
  type ChatMessage,
  type ChatRoll,
} from '@/lib/vtt/chat-rules';
import { userColor } from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';
import { variableRange } from '@/lib/vtt/virtual-grid';
import { DiceIcon } from './DiceIcon';
import { PersonAvatar } from './hud';

const TEXT_ROW_ESTIMATE = 60;
const ROLL_ROW_ESTIMATE = 124;
const STICK_TO_BOTTOM_PX = 40;
const LOAD_MORE_AT_PX = 80;

function estimateHeight(message: ChatMessage): number {
  return message.kind === 'roll' && !message.deleted
    ? ROLL_ROW_ESTIMATE
    : TEXT_ROW_ESTIMATE;
}

type RollOutcome = ReturnType<typeof singleDieOutcome>;

/** Já animadas nesta visita: a lista virtual remonta linhas e o histórico chega depois. */
const animatedRolls = new Set<string>();
/** Só anima rolagem que acabou de chegar (o relógio do servidor pode estar adiantado). */
const FRESH_ROLL_MS = 15_000;

/** Decide uma vez, ao montar; a marcação fica num efeito (render sem efeito colateral). */
function useAnimateRollOnce(id: string, createdAt: string): boolean {
  const [animate] = useState(
    () => !animatedRolls.has(id) && Date.now() - new Date(createdAt).getTime() < FRESH_ROLL_MS
  );
  useEffect(() => {
    animatedRolls.add(id);
  }, [id]);
  return animate;
}

/**
 * Antecipação (Fase 15): o número recua ~120 ms e assenta com um leve overshoot.
 * Crítico exagera (pulso de brilho e o número salta mais); falha crítica treme e
 * escurece. Com movimento reduzido, a Motion corta o `transform`: fica a cor.
 */
const NUMBER_IN: Record<'normal' | 'critical' | 'disaster', TargetAndTransition> = {
  normal: {
    scale: [0.92, 0.84, 1.06, 1],
    opacity: [0, 1, 1, 1],
    transition: { duration: 0.4, times: [0, 0.3, 0.7, 1], ease: EASE_ENTER },
  },
  critical: {
    scale: [0.9, 0.72, 1.3, 1],
    opacity: [0, 1, 1, 1],
    transition: { duration: 0.55, times: [0, 0.22, 0.65, 1], ease: EASE_ENTER },
  },
  disaster: {
    scale: [1.1, 1.18, 0.94, 1],
    opacity: [0, 1, 1, 1],
    transition: { duration: 0.45, times: [0, 0.27, 0.7, 1], ease: EASE_ENTER },
  },
};

const CARD_IN: Record<'normal' | 'critical' | 'disaster', TargetAndTransition> = {
  normal: { opacity: [0, 1], y: [6, 0], transition: { duration: DUR.base, ease: EASE_ENTER } },
  critical: {
    opacity: [0, 1, 1],
    y: [8, 2, 0],
    transition: { duration: DUR.slow, ease: EASE_ENTER },
  },
  // Tremor curto, depois quieto.
  disaster: {
    opacity: [0, 1, 1, 1, 1, 1],
    x: [0, -5, 4, -3, 2, 0],
    transition: { duration: 0.32, ease: 'linear' },
  },
};

function RollCard({
  roll,
  outcome,
  hidden,
  messageId,
  createdAt,
}: {
  roll: ChatRoll;
  outcome: RollOutcome;
  hidden: boolean;
  messageId: string;
  createdAt: string;
}) {
  const animateIn = useAnimateRollOnce(messageId, createdAt);
  const tone = hidden || !outcome ? 'normal' : outcome;
  return (
    <m.div
      initial={false}
      animate={animateIn ? CARD_IN[tone] : undefined}
      className={
        'relative mt-1 space-y-1 overflow-hidden rounded-md border ' +
        (hidden
          ? 'border-dashed border-ink-border p-2 text-ink-muted'
          : tone === 'critical'
            ? 'border-crimson-glow bg-crimson/15 p-3 shadow-[0_0_18px_rgba(196,69,54,0.35)]'
            : tone === 'disaster'
              ? 'border-ink-border bg-ink p-2 opacity-80'
              : 'border-ink-border bg-ink-raised/70 p-2')
      }
    >
      {/* Pulso do crítico / sombra da falha: uma camada por cima, só opacidade. */}
      {animateIn && tone !== 'normal' && (
        <m.span
          aria-hidden
          className={
            'pointer-events-none absolute inset-0 ' +
            (tone === 'critical'
              ? 'bg-[radial-gradient(circle_at_85%_50%,rgba(196,69,54,0.55),transparent_70%)]'
              : 'bg-black')
          }
          initial={{ opacity: 0 }}
          animate={
            tone === 'critical'
              ? { opacity: [0, 1, 0.15, 0.7, 0], transition: { duration: 1.1, ease: 'easeOut' } }
              : { opacity: [0, 0.55, 0], transition: { duration: 0.6, ease: EASE_EXIT } }
          }
        />
      )}
      {roll.label && (
        <p
          className={
            'relative text-sm font-semibold ' +
            (hidden || tone === 'disaster' ? 'text-ink-muted' : 'text-parchment')
          }
        >
          {roll.label}
        </p>
      )}
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <ul
            className={
              'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ' +
              (tone === 'disaster' ? 'text-ink-muted' : 'text-parchment')
            }
          >
            {roll.groups.map((group, index) => (
              <li key={index} className="flex items-center gap-1">
                <DiceIcon sides={group.sides} />
                <span className="break-all">{group.results.join(' ')}</span>
              </li>
            ))}
          </ul>
          <p className="break-all text-xs text-ink-muted">{roll.math}</p>
        </div>
        <div className="shrink-0 text-right">
          <m.strong
            initial={false}
            animate={animateIn ? NUMBER_IN[tone] : undefined}
            className={
              'block origin-right font-display font-bold leading-none ' +
              (hidden
                ? 'text-3xl text-ink-muted'
                : tone === 'critical'
                  ? 'text-5xl text-crimson-glow [text-shadow:0_0_14px_rgba(196,69,54,0.75)]'
                  : tone === 'disaster'
                    ? 'text-3xl text-ink-muted'
                    : 'text-3xl text-crimson-soft')
            }
          >
            {roll.total}
          </m.strong>
          {!hidden && outcome && (
            <span
              className={
                'block text-[10px] font-semibold uppercase tracking-[0.14em] ' +
                (outcome === 'critical' ? 'text-crimson-glow' : 'text-ink-muted')
              }
            >
              {outcomeLabel(outcome, roll.groups[0].sides)}
            </span>
          )}
        </div>
      </div>
    </m.div>
  );
}

function outcomeLabel(outcome: NonNullable<RollOutcome>, sides: number): string {
  if (outcome === 'disaster') return 'Falha crítica · 1 natural';
  return sides === 20 ? 'Crítico · 20 natural' : `Crítico · máximo do d${sides}`;
}

const MessageRow = memo(function MessageRow({
  message,
  whisperName,
  canDelete,
  onDelete,
}: {
  message: ChatMessage;
  whisperName: string | null;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  const roll =
    !message.deleted && isChatRoll(message.roll) ? message.roll : null;
  const outcome = roll ? singleDieOutcome(roll.groups) : null;
  const isWhisper = message.kind === 'whisper' && !message.deleted;
  const name = message.character_name ?? message.author_name;

  return (
    <div className="group border-b border-ink-border/60 px-1 py-2">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-ink-muted">
          <span className="text-sm font-semibold text-parchment">{name}</span>
          {message.character_name && ` · ${message.author_name}`}
        </p>
        <time
          className="shrink-0 text-[10px] text-ink-muted"
          dateTime={message.created_at}
        >
          {new Date(message.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
        {canDelete && (
          <button
            type="button"
            className="shrink-0 self-center text-ink-muted hover:text-crimson-soft focus:opacity-100 desk:opacity-0 desk:group-hover:opacity-100"
            aria-label="Apagar mensagem"
            title="Apagar mensagem"
            onClick={() => onDelete(message.id)}
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
      {(isWhisper || (message.hidden && !message.deleted)) && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
          {isWhisper ? (
            <>
              <Ear size={12} aria-hidden className="shrink-0" />
              <span className="truncate">Sussurro pra {whisperName ?? 'alguém'}</span>
            </>
          ) : (
            <>
              <EyeOff size={12} aria-hidden className="shrink-0" />
              Rolagem escondida
            </>
          )}
        </p>
      )}
      {message.deleted ? (
        <p className="text-sm italic text-ink-muted">mensagem apagada</p>
      ) : roll ? (
        <RollCard
          roll={roll}
          outcome={outcome}
          hidden={message.hidden}
          messageId={message.id}
          createdAt={message.created_at}
        />
      ) : (
        <p
          className={
            'whitespace-pre-wrap break-words text-sm ' +
            (isWhisper ? 'italic text-ink-muted' : 'text-parchment')
          }
        >
          {message.body}
        </p>
      )}
    </div>
  );
});

/** Alturas variam e só são conhecidas depois de desenhar: mede e corrige. */
function MessageList() {
  const messages = useVttStore((s) => s.chatMessages);
  const hasMore = useVttStore((s) => s.chatHasMore);
  const members = useVttStore((s) => s.members);
  const ownerId = useVttStore((s) => s.table?.owner_id);
  const ownerName = useVttStore((s) => s.ownerName);
  const me = useVttStore((s) => s.me);
  const chat = useVttStore((s) => s.chat);

  const scrollRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef(new Map<string, number>());
  const observerRef = useRef<ResizeObserver | null>(null);
  const stickRef = useRef(true);
  const firstIdRef = useRef<string | null>(null);
  const lastTopRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const size = new ResizeObserver(() => setViewport(element.clientHeight));
    size.observe(element);
    const rows = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const row = entry.target as HTMLElement;
        const id = row.dataset.messageId as string;
        const height = row.offsetHeight;
        // 0 = aba escondida: não vale como medida.
        if (!height || heightsRef.current.get(id) === height) continue;
        const previous = heightsRef.current.get(id);
        heightsRef.current.set(id, height);
        changed = true;
        // Linha acima do que está na tela mudou: compensa para nada pular.
        if (
          previous !== undefined &&
          !stickRef.current &&
          row.offsetTop < element.scrollTop
        ) {
          element.scrollTop += height - previous;
        }
      }
      if (changed) setMeasured((v) => v + 1);
    });
    observerRef.current = rows;
    return () => {
      size.disconnect();
      rows.disconnect();
      observerRef.current = null;
    };
  }, []);

  const observeRow = useCallback((row: HTMLDivElement | null) => {
    if (row) observerRef.current?.observe(row);
  }, []);

  const heights = useMemo(
    () =>
      messages.map(
        (message) =>
          heightsRef.current.get(message.id) ?? estimateHeight(message)
      ),
    // `measured` sobe quando heightsRef muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, measured]
  );

  const range = variableRange({ heights, scrollTop, viewportHeight: viewport });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const firstId = messages[0]?.id ?? null;
    if (stickRef.current) {
      element.scrollTop = element.scrollHeight;
    } else if (firstIdRef.current && firstId !== firstIdRef.current) {
      // "Carregar mais" colocou linhas no topo: a leitura fica onde estava.
      const oldIndex = messages.findIndex((m) => m.id === firstIdRef.current);
      let added = 0;
      for (let i = 0; i < oldIndex; i++) added += heights[i];
      element.scrollTop += added;
    }
    firstIdRef.current = firstId;
    setScrollTop(element.scrollTop);
  }, [messages, heights, viewport]);

  function onScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      STICK_TO_BOTTOM_PX;
    // Só subir solta do fim: linhas medidas depois de descer não são a pessoa rolando.
    if (atBottom) stickRef.current = true;
    else if (element.scrollTop < lastTopRef.current) stickRef.current = false;
    lastTopRef.current = element.scrollTop;
    setScrollTop(element.scrollTop);
    if (element.scrollTop < LOAD_MORE_AT_PX && hasMore) void chat?.loadOlder();
  }

  const onDelete = useCallback(
    (id: string) => void useVttStore.getState().chat?.deleteMessage(id),
    []
  );

  function whisperName(message: ChatMessage): string | null {
    if (!message.whisper_to) return null;
    if (message.whisper_to === me?.userId) return 'você';
    if (message.whisper_to === ownerId) return ownerName;
    return (
      members.find((member) => member.userId === message.whisper_to)?.name ??
      'alguém'
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative min-h-0 flex-1 overflow-y-auto"
      style={{ overflowAnchor: 'none' }}
      role="log"
      aria-label="Mensagens"
    >
      {messages.length === 0 && (
        <p className="p-1 text-sm text-ink-muted">
          Nada por aqui ainda. Escreva abaixo, ou role com /r 1d20.
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          className="btn-ghost mb-1 w-full px-2 py-1 text-xs"
          onClick={() => void chat?.loadOlder()}
        >
          Carregar mais
        </button>
      )}
      <div style={{ height: range.paddingTop }} />
      {messages.slice(range.start, range.end).map((message) => (
        <div key={message.id} ref={observeRow} data-message-id={message.id}>
          <MessageRow
            message={message}
            whisperName={whisperName(message)}
            canDelete={Boolean(
              me && canDeleteMessage(message, me.role, me.userId)
            )}
            onDelete={onDelete}
          />
        </div>
      ))}
      <div style={{ height: range.paddingBottom }} />
    </div>
  );
}

function ChatInput() {
  const chat = useVttStore((s) => s.chat);
  const members = useVttStore((s) => s.members);
  const colors = useVttStore((s) => s.peopleColors);
  const ownerId = useVttStore((s) => s.table?.owner_id);
  const ownerName = useVttStore((s) => s.ownerName);
  const userId = useVttStore((s) => s.me?.userId);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const targets = useMemo(() => {
    const people = members
      .filter((member) => !member.banned)
      .map(({ userId: id, name }) => ({ userId: id, name }));
    if (ownerId) people.push({ userId: ownerId, name: ownerName });
    return buildWhisperTargets(
      people.map((person) => ({
        ...person,
        color: colors[person.userId] ?? userColor(person.userId),
      })),
      userId ?? ''
    );
  }, [members, colors, ownerId, ownerName, userId]);

  const suggestions = useMemo(
    () => (dismissed ? [] : chatSuggestions(text, targets)),
    [dismissed, text, targets]
  );

  function change(next: string) {
    setText(next);
    setError(null);
    setActive(0);
    setDismissed(false);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || !chat || busy) return;
    setBusy(true);
    const failure = await chat.send(text, targets);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    change('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      change(suggestions[active].value);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setDismissed(true);
    }
  }

  return (
    <form onSubmit={submit} className="relative shrink-0 space-y-1">
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Sugestões"
          className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-60 overflow-y-auto rounded-md border border-ink-border bg-ink-raised p-1"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.person?.userId ?? suggestion.label}
              role="option"
              aria-selected={index === active}
            >
              <button
                type="button"
                className={
                  'flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm text-parchment desk:min-h-8 ' +
                  (index === active ? 'bg-crimson/25' : 'hover:bg-ink')
                }
                onClick={() => change(suggestion.value)}
              >
                {suggestion.person && (
                  <PersonAvatar
                    name={suggestion.label}
                    color={suggestion.person.color ?? userColor(suggestion.person.userId)}
                    className="h-6 w-6"
                  />
                )}
                <span className="shrink-0">{suggestion.label}</span>
                {suggestion.hint && (
                  <span className="min-w-0 truncate text-xs text-ink-muted">
                    {suggestion.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
      <div className="flex gap-1">
        <input
          className="field min-w-0 flex-1 px-2 py-2 text-sm"
          value={text}
          maxLength={2000}
          placeholder="Mensagem, /r 2d6+3, /shiu Nome…"
          aria-label="Mensagem"
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="btn-primary shrink-0 px-3 py-2 text-xs"
          disabled={busy || !text.trim()}
        >
          Enviar
        </button>
      </div>
    </form>
  );
}

export function ChatPanel() {
  const error = useVttStore((s) => s.chatError);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {error && <p className="shrink-0 text-xs text-crimson-soft">{error}</p>}
      <MessageList />
      <ChatInput />
    </div>
  );
}
