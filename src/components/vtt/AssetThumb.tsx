import { libraryImageUrl, type Asset } from '@/lib/vtt/assets/rules';

function placeholderIcon(kind: Asset['kind']): string {
  if (kind === 'cutscene') return '🎬';
  if (kind === 'audio_ambiente' || kind === 'audio_sfx') return '♪';
  return '🖼';
}

export function AssetThumb({
  asset,
  size,
}: {
  asset: Pick<Asset, 'kind' | 'url' | 'thumb_url' | 'name'>;
  size: number;
}) {
  const src = libraryImageUrl(asset);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- otimizador da Vercel gastaria cota; a URL já tem CDN
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="block bg-ink-raised object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  // Sem <video>/<audio> na grade: miniatura de cutscene baixaria o vídeo inteiro.
  return (
    <span
      aria-hidden
      className="flex items-center justify-center bg-ink-raised text-3xl text-ink-muted"
      style={{ width: size, height: size }}
    >
      {placeholderIcon(asset.kind)}
    </span>
  );
}
