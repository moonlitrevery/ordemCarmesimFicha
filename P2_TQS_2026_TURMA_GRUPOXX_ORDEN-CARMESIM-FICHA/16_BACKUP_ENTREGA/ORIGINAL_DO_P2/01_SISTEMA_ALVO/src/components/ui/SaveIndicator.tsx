export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const map = {
    saving: { text: 'Salvando…', className: 'text-ink-muted' },
    saved: { text: 'Salvo', className: 'text-emerald-400/90' },
    error: { text: 'Erro ao salvar', className: 'text-crimson-soft' },
  } as const;
  const item = map[status];
  return (
    <span className={`text-xs ${item.className}`} aria-live="polite">
      {item.text}
    </span>
  );
}
