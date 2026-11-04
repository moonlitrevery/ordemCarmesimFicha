'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ASSET_DRAG_TYPE, type Asset } from '@/lib/vtt/assets/rules';
import type { VttEngine } from '@/lib/vtt/engine/stage';
import { isPlaceableKind } from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';

/** Só monta e solta o engine: depois disso o canvas lê o store sozinho. */
export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VttEngine | null>(null);
  const sync = useVttStore((s) => s.sync);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let engine: VttEngine | null = null;

    // Import dinâmico: o Pixi fica fora do bundle do resto do site.
    void import('@/lib/vtt/engine/stage')
      .then(({ VttEngine: Engine }) => Engine.create(host, () => disposed))
      .then((created) => {
        engine = created;
        if (disposed) {
          created.destroy();
          return;
        }
        engineRef.current = created;
        useVttStore.getState().sync?.attachEngine(created);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      engineRef.current = null;
      useVttStore.getState().sync?.attachEngine(null);
      engine?.destroy();
    };
  }, []);

  useEffect(() => {
    if (sync && engineRef.current) sync.attachEngine(engineRef.current);
  }, [sync]);

  function onDragOver(event: DragEvent) {
    const types = event.dataTransfer.types;
    if (types.includes(ASSET_DRAG_TYPE) || types.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const engine = engineRef.current;
    const currentSync = useVttStore.getState().sync;
    if (!engine || !currentSync) return;
    const at = engine.clientToScreen(event.clientX, event.clientY);
    const world = engine.toWorld(at.x, at.y);

    const payload = event.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (payload) {
      // Outra página também consegue soltar algo com este tipo.
      try {
        const asset = JSON.parse(payload) as Asset;
        if (isPlaceableKind(asset.kind)) {
          void currentSync.placeAsset(asset, world.x, world.y);
        }
      } catch {
        // Não era um asset nosso.
      }
      return;
    }
    void currentSync.dropFiles(
      Array.from(event.dataTransfer.files),
      world.x,
      world.y
    );
  }

  if (failed) {
    return (
      <p className="flex h-full items-center justify-center p-4 text-center text-sm text-crimson-soft">
        Este aparelho não conseguiu iniciar o mapa (WebGL indisponível).
      </p>
    );
  }

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 overflow-hidden"
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  );
}
