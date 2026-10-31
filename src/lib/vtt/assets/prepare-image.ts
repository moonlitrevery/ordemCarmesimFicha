import {
  fitWithin,
  hasThumb,
  maxSideForKind,
  THUMB_MAX_SIDE,
  type AssetKind,
} from './rules';

const WEBP_QUALITY = 0.85;

export interface PreparedImage {
  blob: Blob;
  /** Só em tipos com miniatura própria (mapa e adereço). */
  thumb: Blob | null;
  width: number;
  height: number;
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponível.');
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Falha ao comprimir a imagem.')),
      'image/webp',
      WEBP_QUALITY
    );
  });
}

/** Reduz para o limite do tipo e recodifica em WebP (Safari devolve PNG). */
export async function prepareImage(
  file: Blob,
  kind: AssetKind
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      maxSideForKind(kind)
    );
    const blob = await encode(bitmap, width, height);
    let thumb: Blob | null = null;
    if (hasThumb(kind)) {
      const size = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_SIDE);
      thumb = await encode(bitmap, size.width, size.height);
    }
    return { blob, thumb, width, height };
  } finally {
    bitmap.close();
  }
}

/** Só a largura, para sugerir o tipo: lê o cabeçalho sem decodificar a imagem. */
export function readImageWidth(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const finish = (width: number | null) => {
      URL.revokeObjectURL(url);
      resolve(width);
    };
    image.onload = () => finish(image.naturalWidth);
    image.onerror = () => finish(null);
    image.src = url;
  });
}
