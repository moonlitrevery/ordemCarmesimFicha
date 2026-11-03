'use client';

import type { UploadPhase } from '@/lib/vtt/docs/upload';

export const PHASE_LABELS: Record<UploadPhase, string> = {
  compressing: 'Comprimindo…',
  uploading: 'Enviando…',
  saving: 'Salvando…',
};

export function UploadProgress({
  name,
  phase,
  progress,
}: {
  name: string;
  phase: UploadPhase;
  progress: number;
}) {
  return (
    <div className="space-y-1 rounded-md border border-ink-border p-2 text-xs">
      <p className="truncate text-parchment" title={name}>
        {name}
      </p>
      <p className="text-ink-muted">{PHASE_LABELS[phase]}</p>
      <div
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 overflow-hidden rounded bg-ink-border"
      >
        <div className="h-full bg-crimson" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
