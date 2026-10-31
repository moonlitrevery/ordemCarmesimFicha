'use client';

import { useState, type FormEvent } from 'react';
import {
  DEFAULT_CAPTION,
  MAX_CAPTION_LENGTH,
  sanitizeCaption,
} from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';
import type { Caption } from '@/lib/vtt/types';

function CaptionForm({ id, initial }: { id: string; initial: Caption }) {
  const [caption, setCaption] = useState(initial);
  const change = (patch: Partial<Caption>) =>
    setCaption((current) => ({ ...current, ...patch }));
  const close = () => useVttStore.setState({ captionTargetId: null });

  function save(event: FormEvent) {
    event.preventDefault();
    void useVttStore
      .getState()
      .sync?.patchObject(id, { caption: sanitizeCaption(caption) });
    close();
  }

  return (
    <form
      onSubmit={save}
      className="panel w-full max-w-sm space-y-3 p-4"
      aria-label="Legenda do token"
    >
      <h2 className="font-display text-xl text-parchment">Legenda</h2>
      <div>
        <label className="label" htmlFor="caption-text">
          Texto
        </label>
        <input
          id="caption-text"
          className="field"
          autoFocus
          maxLength={MAX_CAPTION_LENGTH}
          value={caption.text}
          onChange={(e) => change({ text: e.target.value })}
        />
        <p className="mt-1 text-xs text-ink-muted">Vazio tira a legenda.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="label flex items-center justify-between gap-2">
          Cor do texto
          <input
            type="color"
            value={caption.color}
            onChange={(e) => change({ color: e.target.value })}
          />
        </label>
        <label className="label flex items-center justify-between gap-2">
          Contorno
          <input
            type="color"
            value={caption.stroke}
            onChange={(e) => change({ stroke: e.target.value })}
          />
        </label>
      </div>
      <label className="label block">
        Espessura do contorno: {caption.strokeWidth}
        <input
          type="range"
          min={0}
          max={8}
          className="mt-1 block w-full"
          value={caption.strokeWidth}
          onChange={(e) => change({ strokeWidth: Number(e.target.value) })}
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-parchment">
          <input
            type="checkbox"
            checked={caption.glow}
            onChange={(e) => change({ glow: e.target.checked })}
          />
          Glow
        </label>
        <input
          type="color"
          aria-label="Cor do glow"
          disabled={!caption.glow}
          value={caption.glowColor}
          onChange={(e) => change({ glowColor: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-parchment">
        <input
          type="checkbox"
          checked={caption.obfuscated}
          onChange={(e) => change({ obfuscated: e.target.checked })}
        />
        Ofuscar (letras embaralhadas sem parar)
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={close}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary">
          Salvar
        </button>
      </div>
    </form>
  );
}

export function CaptionModal() {
  const id = useVttStore((s) => s.captionTargetId);
  const object = useVttStore((s) =>
    s.captionTargetId ? s.objects[s.captionTargetId] : undefined
  );
  if (!id || !object) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <CaptionForm
        key={id}
        id={id}
        initial={object.caption ?? DEFAULT_CAPTION}
      />
    </div>
  );
}
