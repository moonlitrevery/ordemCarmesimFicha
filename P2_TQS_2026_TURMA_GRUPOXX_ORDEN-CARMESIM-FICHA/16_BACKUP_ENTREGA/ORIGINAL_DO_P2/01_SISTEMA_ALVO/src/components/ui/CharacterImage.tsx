'use client';

import { useState } from 'react';
import { VALID_IMAGE_URL } from '@/lib/constants';

export function CharacterImage({
  url,
  name,
  className = '',
  lazy = false,
}: {
  url: string | null | undefined;
  name: string;
  /** Precisa fixar a altura: é o que reserva o espaço enquanto a imagem carrega. */
  className?: string;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const valid = !!url && VALID_IMAGE_URL.test(url.split('#')[0]);

  if (!valid || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-ink-raised text-ink-muted ${className}`}
        aria-label="Sem imagem"
      >
        <svg viewBox="0 0 24 24" className="h-10 w-10 opacity-50" fill="currentColor">
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url!}
      alt={name}
      className={`object-cover ${className}`}
      loading={lazy ? 'lazy' : undefined}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
