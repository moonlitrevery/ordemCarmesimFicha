'use client';

import { useVttStore } from '@/lib/vtt/store';

/** Faixa no topo do mapa: onde a mestra está e o modo em andamento. */
export function SceneViewBanner() {
  const isGm = useVttStore((s) => s.me?.role === 'mestre');
  const scenes = useVttStore((s) => s.scenes);
  const members = useVttStore((s) => s.members);
  const viewedSceneId = useVttStore((s) => s.viewedSceneId);
  const defaultSceneId = useVttStore((s) => s.table?.default_scene_id ?? null);
  const sessionOpen = useVttStore((s) => s.sessionOpen);
  const attaching = useVttStore((s) => Boolean(s.attachingId));
  const armedName = useVttStore((s) => s.armedAsset?.name ?? null);
  const calibrating = useVttStore((s) => s.calibrating);

  const nameOf = (id: string | null) =>
    scenes.find((scene) => scene.id === id)?.name ?? 'nenhuma cena';

  // Só jogador pode estar separado; espectador fica sempre na cena padrão.
  const playerScenes = Array.from(
    new Set(
      members
        .filter((m) => m.role === 'jogador' && !m.banned)
        .map((m) => m.sceneId ?? defaultSceneId)
    )
  );
  if (playerScenes.length === 0) playerScenes.push(defaultSceneId);

  const hint = attaching
    ? 'Clique no token que vai segurar este objeto. Esc cancela.'
    : armedName
      ? `Toque no mapa para colocar ${armedName}. Esc cancela.`
      : calibrating
        ? 'Arraste sobre um trecho de tamanho conhecido. Esc cancela.'
        : null;

  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-col items-center gap-1 text-center text-xs">
      {isGm && (
        <p className="rounded-md border border-ink-border bg-ink-raised/95 px-2 py-1 text-parchment">
          Você está vendo: <strong>{nameOf(viewedSceneId)}</strong> — jogadores
          estão em: <strong>{playerScenes.map(nameOf).join(', ')}</strong>
          {!sessionOpen && ' (sessão fechada)'}
        </p>
      )}
      {hint && (
        <p className="rounded-md border border-crimson/50 bg-ink-raised/95 px-2 py-1 text-parchment">
          {hint}
        </p>
      )}
    </div>
  );
}
