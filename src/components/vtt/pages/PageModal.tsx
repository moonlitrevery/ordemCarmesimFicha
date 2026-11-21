'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { FLOATING_PANEL, IconButton } from '../hud';

/** Modal pequeno por cima do overlay de Páginas. Quem fecha com Esc é o overlay. */
export function PageModal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-ink/70 p-2 desk:items-center desk:p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          FLOATING_PANEL +
          ' w-full space-y-3 rounded-xl p-4 text-sm text-parchment ' +
          (wide ? 'max-w-2xl' : 'max-w-md')
        }
      >
        <header className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl">{title}</h2>
          <IconButton icon={X} label="Fechar" tooltip="native" onClick={onClose} />
        </header>
        {children}
      </div>
    </div>
  );
}

export function FolderSelect({
  folders,
  value,
  onChange,
  id,
}: {
  folders: string[];
  value: string;
  onChange: (folder: string) => void;
  id: string;
}) {
  return (
    <select
      id={id}
      className="field min-h-11 px-2 py-1 text-xs desk:min-h-8"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Sem pasta</option>
      {folders.map((folder) => (
        <option key={folder} value={folder}>
          {folder}
        </option>
      ))}
    </select>
  );
}
