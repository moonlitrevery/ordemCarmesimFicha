'use client';

import { useVttStore } from '@/lib/vtt/store';

/** Abaixo da barra de ferramentas: só o que a pessoa precisa saber agora. */
export function SceneViewBanner() {
  const isGm = useVttStore((s) => s.me?.role === 'mestre');
  const scenes = useVttStore((s) => s.scenes);
  const members = useVttStore((s) => s.members);
  const viewedSceneId = useVttStore((s) => s.viewedSceneId);
  const defaultSceneId = useVttStore((s) => s.table?.default_scene_id ?? null);
  const attaching = useVttStore((s) => Boolean(s.attachingId));
  const armedName = useVttStore((s) => s.armedAsset?.name ?? null);

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

  const elsewhere =
    isGm && playerScenes.some((sceneId) => sceneId !== viewedSceneId);

  const hint = attaching
    ? 'Clique no token que vai segurar este objeto. Esc cancela.'
    : armedName
      ? `Toque no mapa para colocar ${armedName}. Esc cancela.`
      : null;

  if (!elsewhere && !hint) return null;

  return (
    <div className="pointer-events-none absolute inset-x-2 top-32 z-10 flex flex-col items-center gap-1 text-center text-xs desk:top-14">
      {elsewhere && (
        <p className="rounded-md border border-ink-border bg-ink-raised/95 px-2 py-1 text-parchment">
          Você está vendo <strong>{nameOf(viewedSceneId)}</strong> — jogadores
          estão em <strong>{playerScenes.map(nameOf).join(', ')}</strong>
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
