'use client';

import { Check } from 'lucide-react';
import { useVttStore } from '@/lib/vtt/store';

/** Só a mestra chega aqui. O trigger do banco recusa o vínculo de qualquer outra pessoa. */
export function NpcLinkModal() {
  const id = useVttStore((s) => s.npcLinkTargetId);
  const object = useVttStore((s) =>
    s.npcLinkTargetId ? s.objects[s.npcLinkTargetId] : undefined
  );
  const npcs = useVttStore((s) => s.npcs);
  if (!id || !object) return null;

  const close = () => useVttStore.setState({ npcLinkTargetId: null });
  const link = (npcId: string | null) => {
    void useVttStore.getState().sync?.changeObject(id, { npc_id: npcId });
    close();
  };
  const list = Object.values(npcs).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-label="Vincular NPC"
        className="panel flex max-h-[80vh] w-full max-w-sm flex-col gap-3 p-4"
      >
        <h2 className="font-display text-xl text-parchment">Vincular NPC</h2>
        {list.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nenhum NPC nesta mesa ainda. Crie um no painel NPCs.
          </p>
        ) : (
          <ul className="min-h-0 space-y-1 overflow-y-auto">
            {list.map((npc) => (
              <li key={npc.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm text-parchment hover:bg-ink desk:min-h-8"
                  onClick={() => link(npc.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{npc.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">ND {npc.nd}</span>
                  {object.npc_id === npc.id && (
                    <Check size={14} aria-hidden className="shrink-0 text-crimson-soft" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          {object.npc_id && (
            <button type="button" className="btn-ghost" onClick={() => link(null)}>
              Desvincular
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={close}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
