export const ASSET_KINDS = [
  'mapa',
  'token',
  'addon',
  'adereco',
  'audio_ambiente',
  'audio_sfx',
  'cutscene',
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export type AssetStatus = 'approved' | 'pending' | 'rejected';

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  storage_key: string;
  url: string;
  thumb_url: string | null;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  tags: string[];
  status: AssetStatus;
  uploaded_by: string | null;
  created_at: string;
}

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  mapa: 'Mapas',
  token: 'Tokens',
  addon: 'Addons',
  adereco: 'Adereços',
  audio_ambiente: 'Sons ambiente',
  audio_sfx: 'SFX',
  cutscene: 'Cutscenes',
};

/** Asset arrastado da lista para o mapa, no dataTransfer. */
export const ASSET_DRAG_TYPE = 'application/x-vtt-asset';

export const IMAGE_KINDS: AssetKind[] = ['mapa', 'token', 'addon', 'adereco'];
export const AUDIO_KINDS: AssetKind[] = ['audio_ambiente', 'audio_sfx'];

/** Jogador só sobe imagem, e ela cai como pendente. */
export const PLAYER_KINDS = IMAGE_KINDS;

const MB = 1024 * 1024;
const IMAGE_MAX_BYTES = 15 * MB;
const AUDIO_MAX_BYTES = 8 * MB;
const CUTSCENE_MAX_BYTES = 40 * MB;

/** Tokens e addons já têm no máximo 512 px: o arquivo serve de miniatura. */
const THUMB_KINDS: AssetKind[] = ['mapa', 'adereco'];
export const THUMB_MAX_SIDE = 256;
export const THUMB_MAX_BYTES = 1 * MB;

/** Acima disto a sugestão para imagem é mapa, não token. */
const MAP_SUGGESTION_MIN_WIDTH = 2000;

const SOURCE_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
];
// O que sai do prepareImage: Safari não codifica WebP e devolve PNG.
const UPLOAD_IMAGE_MIMES = ['image/webp', 'image/png', 'image/jpeg'];
const AUDIO_MIMES = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a'];
const CUTSCENE_MIMES = ['video/webm', 'video/mp4'];

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

export function isAssetKind(value: unknown): value is AssetKind {
  return ASSET_KINDS.includes(value as AssetKind);
}

export function isImageKind(kind: AssetKind): boolean {
  return IMAGE_KINDS.includes(kind);
}

export function isAudioKind(kind: AssetKind): boolean {
  return AUDIO_KINDS.includes(kind);
}

export function hasThumb(kind: AssetKind): boolean {
  return THUMB_KINDS.includes(kind);
}

/** O que a biblioteca pode baixar. `null` = nunca carregar o arquivo cheio. */
export function libraryImageUrl(
  asset: Pick<Asset, 'kind' | 'url' | 'thumb_url'>
): string | null {
  if (!isImageKind(asset.kind)) return null;
  return hasThumb(asset.kind) ? asset.thumb_url : asset.url;
}

export function canRoleUploadKind(isMestre: boolean, kind: AssetKind): boolean {
  return isMestre || PLAYER_KINDS.includes(kind);
}

export function maxBytesForKind(kind: AssetKind): number {
  if (isImageKind(kind)) return IMAGE_MAX_BYTES;
  if (isAudioKind(kind)) return AUDIO_MAX_BYTES;
  return CUTSCENE_MAX_BYTES;
}

/** Tipos aceitos pelo Blob, já depois da compressão no cliente. */
export function uploadMimesForKind(kind: AssetKind): string[] {
  if (isImageKind(kind)) return UPLOAD_IMAGE_MIMES;
  if (isAudioKind(kind)) return AUDIO_MIMES;
  return CUTSCENE_MIMES;
}

export function maxSideForKind(kind: AssetKind): number {
  if (kind === 'mapa') return 4096;
  if (kind === 'adereco') return 1024;
  return 512;
}

export function fitWithin(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function kindsForMime(mime: string): AssetKind[] {
  if (SOURCE_IMAGE_MIMES.includes(mime)) return IMAGE_KINDS;
  if (AUDIO_MIMES.includes(mime)) return AUDIO_KINDS;
  if (CUTSCENE_MIMES.includes(mime)) return ['cutscene'];
  return [];
}

export function suggestKind(
  mime: string,
  imageWidth: number | null
): AssetKind | null {
  if (SOURCE_IMAGE_MIMES.includes(mime)) {
    return (imageWidth ?? 0) > MAP_SUGGESTION_MIN_WIDTH ? 'mapa' : 'token';
  }
  if (AUDIO_MIMES.includes(mime)) return 'audio_ambiente';
  if (CUTSCENE_MIMES.includes(mime)) return 'cutscene';
  return null;
}

/** Valida o arquivo original escolhido no navegador. `null` = pode subir. */
export function validateSourceFile(
  file: { type: string; size: number },
  kind: AssetKind
): string | null {
  if (file.type === 'audio/wav' || file.type === 'audio/x-wav') {
    return 'WAV não é aceito. Converta para OGG, MP3 ou M4A.';
  }
  if (!kindsForMime(file.type).includes(kind)) {
    return 'Formato não aceito para este tipo.';
  }
  const max = maxBytesForKind(kind);
  if (file.size > max) {
    return `Arquivo maior que o limite de ${max / MB} MB.`;
  }
  return null;
}

export function buildAssetPathname(
  kind: AssetKind,
  id: string,
  mime: string
): string {
  return `${kind}/${id}.${EXTENSION_BY_MIME[mime] ?? 'bin'}`;
}

/** O nome final ganha sufixo aleatório do Blob: aqui só vale o que o cliente pede. */
export function isRequestedPathnameValid(
  pathname: string,
  kind: AssetKind
): boolean {
  const prefix = `${kind}/`;
  if (!pathname.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.[a-z0-9]+$/.test(pathname.slice(prefix.length));
}

export function thumbPathPrefix(kind: AssetKind): string {
  return `thumbs/${kind}/`;
}

export function buildThumbPathname(
  kind: AssetKind,
  id: string,
  mime: string
): string {
  return `${thumbPathPrefix(kind)}${id}.${EXTENSION_BY_MIME[mime] ?? 'bin'}`;
}

export function isRequestedThumbPathnameValid(
  pathname: string,
  kind: AssetKind
): boolean {
  const prefix = thumbPathPrefix(kind);
  if (!pathname.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.[a-z0-9]+$/.test(pathname.slice(prefix.length));
}

/** Token: vercel_blob_rw_<storeId>_<segredo>; URL: <storeid>.public.blob... */
export function blobHostFromToken(token: string): string | null {
  const match = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(token);
  if (!match) return null;
  return `${match[1].toLowerCase()}.public.blob.vercel-storage.com`;
}

export function isUrlFromHost(url: string, host: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === host;
  } catch {
    return false;
  }
}

export function sanitizeAssetName(name: string): string {
  return (name.trim() || 'Sem nome').slice(0, 120);
}

export function assetNameFromFile(fileName: string): string {
  return sanitizeAssetName(fileName.replace(/\.[^.]+$/, ''));
}

export function parseTags(input: string): string[] {
  const tags = input
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(tags));
}

export function matchesSearch(
  asset: Pick<Asset, 'name' | 'tags'>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    asset.name.toLowerCase().includes(needle) ||
    asset.tags.some((tag) => tag.includes(needle))
  );
}

export function canDeleteAsset(
  asset: Pick<Asset, 'status' | 'uploaded_by'>,
  userId: string,
  isMestre: boolean
): boolean {
  return (
    isMestre || (asset.status === 'pending' && asset.uploaded_by === userId)
  );
}

/** `upload()` esconde o erro do servidor; aqui sobra só o texto da biblioteca. */
export function uploadErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('suspended') || text.includes('quota')) {
    return 'A cota do Blob estourou este mês. O envio volta quando o mês virar.';
  }
  if (text.includes('too large')) return 'Arquivo maior que o limite permitido.';
  if (text.includes('content type')) return 'Formato de arquivo não permitido.';
  if (text.includes('client token')) {
    return 'O servidor recusou este arquivo. Verifique se você pode enviar este tipo.';
  }
  return 'Não foi possível enviar o arquivo. Tente de novo.';
}
