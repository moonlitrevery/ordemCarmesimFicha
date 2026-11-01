import { Film, Image as ImageIcon, Music } from 'lucide-react';
import { isAudioKind, libraryImageUrl, type Asset } from '@/lib/vtt/assets/rules';

function placeholderIcon(kind: Asset['kind']) {
  if (kind === 'cutscene') return Film;
  if (isAudioKind(kind)) return Music;
  return ImageIcon;
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
        width={size}
        height={size}
        className="block shrink-0 bg-ink-raised object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  // Sem <video>/<audio> na grade: miniatura de cutscene baixaria o vídeo inteiro.
  const Icon = placeholderIcon(asset.kind);
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center bg-ink-raised text-ink-muted"
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size / 2)} />
    </span>
  );
}
