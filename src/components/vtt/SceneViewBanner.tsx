'use client';

import { useVttStore } from '@/lib/vtt/store';
import { InitiativeStrip } from './InitiativeStrip';

const BUTTON =
  'pointer-events-auto min-h-11 rounded-md border border-ink-border px-2 py-0.5 text-xs text-parchment hover:border-crimson/60 desk:min-h-0';

/**
 * Abaixo da barra de ferramentas: só o que a pessoa precisa saber agora. Para a
 * mestra, onde ela está e onde está a fita dos jogadores (Fase 12); para quem
 * joga, a ordem de iniciativa, só leitura.
 */
export function SceneViewBanner() {
  const isGm = useVttStore((s) => s.me?.role === 'mestre');
  const scenes = useVttStore((s) => s.scenes);
  const viewedSceneId = useVttStore((s) => s.viewedSceneId);
  const partySceneId = useVttStore((s) => s.table?.default_scene_id ?? null);
  const sync = useVttStore((s) => s.sync);
  const attaching = useVttStore((s) => Boolean(s.attachingId));
  const armedName = useVttStore((s) => s.armedAsset?.name ?? null);

  const nameOf = (id: string | null) =>
    scenes.find((scene) => scene.id === id)?.name ?? 'nenhuma página';

  // "Separar grupo" saiu da interface: os jogadores estão sempre onde está a fita.
  const elsewhere = isGm && Boolean(partySceneId) && partySceneId !== viewedSceneId;

  const hint = attaching
    ? 'Clique no token que vai segurar este objeto. Esc cancela.'
    : armedName
      ? `Toque no mapa para colocar ${armedName}. Esc cancela.`
      : null;

  return (
    <div
      className="pointer-events-none absolute left-2 right-[calc(var(--vtt-right,0px)_+_0.5rem)] top-32 z-10 flex flex-col items-center gap-1 text-center text-xs desk:top-14"
    >
      {elsewhere && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md border border-ink-border bg-ink-raised/95 px-2 py-1 text-parchment">
          <span>
            Você está em: <strong>{nameOf(viewedSceneId)}</strong> — Jogadores em:{' '}
            <strong>{nameOf(partySceneId)}</strong>
          </span>
          <button
            type="button"
            className={BUTTON}
            onClick={() => useVttStore.setState({ gmSceneChoice: partySceneId })}
          >
            Voltar para os jogadores
          </button>
          {viewedSceneId && (
            <button
              type="button"
              className={BUTTON}
              onClick={() => void sync?.movePartyTo(viewedSceneId)}
            >
              Trazer jogadores pra cá
            </button>
          )}
        </div>
      )}
      {!isGm && <InitiativeStrip />}
      {hint && (
        <p className="rounded-md border border-crimson/50 bg-ink-raised/95 px-2 py-1 text-parchment">
          {hint}
        </p>
      )}
    </div>
  );
}
