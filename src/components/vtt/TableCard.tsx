import Link from 'next/link';
import { CopyCodeButton } from './CopyCodeButton';

export function TableCard({
  id,
  name,
  ownerName,
  sessionOpen,
  code,
}: {
  id: string;
  name: string;
  ownerName: string;
  sessionOpen: boolean;
  code: string | null;
}) {
  return (
    <article className="panel flex flex-col gap-3 p-4 transition hover:border-crimson/50">
      <Link href={`/mesa/${id}`} prefetch={false} className="block min-w-0">
        <h3 className="truncate font-display text-2xl text-parchment">{name}</h3>
        <p className="truncate text-sm text-ink-muted">Mestre: {ownerName}</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
          <span
            className={
              'h-2 w-2 rounded-full ' +
              (sessionOpen ? 'bg-emerald-400' : 'bg-ink-border')
            }
            aria-hidden
          />
          {sessionOpen ? 'Sessão aberta' : 'Sessão fechada'}
        </p>
      </Link>
      {code && (
        <div className="flex items-center justify-between gap-2 border-t border-ink-border pt-3">
          <span className="font-mono tracking-[0.2em] text-parchment">{code}</span>
          <CopyCodeButton code={code} />
        </div>
      )}
    </article>
  );
}
