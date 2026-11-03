export const DOCUMENT_CATEGORIES = ['carta', 'prova', 'pista', 'referencia'] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  carta: 'Cartas',
  prova: 'Provas',
  pista: 'Pistas',
  referencia: 'Referências',
};

export type DocumentStatus = 'approved' | 'pending';

export interface TableDocument {
  id: string;
  table_id: string;
  category: DocumentCategory;
  title: string;
  storage_key: string;
  url: string;
  mime: string;
  size_bytes: number;
  status: DocumentStatus;
  uploaded_by: string | null;
  shown_at: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
}

export interface TableReport {
  id: string;
  table_id: string;
  title: string;
  storage_key: string;
  url: string;
  mime: string;
  size_bytes: number;
  author_id: string | null;
  character_id: string | null;
  character_name: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
}

/** Pasta no Blob. */
export type TableFileKind = 'documento' | 'relatorio';

export type TableFileCollection = 'documents' | 'reports';

export const COLLECTION_TABLE: Record<TableFileCollection, string> = {
  documents: 'table_documents',
  reports: 'table_reports',
};

export const COLLECTION_KIND: Record<TableFileCollection, TableFileKind> = {
  documents: 'documento',
  reports: 'relatorio',
};

export type TableUploadRole = 'gm' | 'player';

export type ViewerKind = 'image' | 'pdf' | 'audio' | 'markdown' | 'text' | 'docx';

export interface ViewerTarget {
  id: string;
  title: string;
  url: string;
  mime: string;
}

const MB = 1024 * 1024;
const IMAGE_MAX_BYTES = 15 * MB;
const AUDIO_MAX_BYTES = 8 * MB;
const PDF_MAX_BYTES = 20 * MB;
const TEXT_MAX_BYTES = 10 * MB;

/** Referência (e todo documento em imagem) sai do navegador com este lado máximo. */
export const DOCUMENT_IMAGE_MAX_SIDE = 2048;

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** O que pode ficar guardado: imagem já chega comprimida pelo cliente. */
const DOCUMENT_MIMES = [
  'application/pdf',
  'image/webp',
  'image/png',
  'image/jpeg',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
];
const REPORT_MIMES = ['application/pdf', 'text/markdown', 'text/plain', DOCX_MIME];

// A extensão manda: no Windows o navegador costuma dar `type` vazio para .md e .m4a.
const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};
const REPORT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  docx: DOCX_MIME,
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'text/markdown': 'md',
  'text/plain': 'txt',
  [DOCX_MIME]: 'docx',
};

export const DOCUMENT_ACCEPT = 'application/pdf,image/*,audio/*,.pdf,.ogg,.opus,.mp3,.m4a';
export const REPORT_ACCEPT = '.docx,.pdf,.md,.markdown,.txt';

export function isTableFileKind(value: unknown): value is TableFileKind {
  return value === 'documento' || value === 'relatorio';
}

export function isTableFileCollection(value: unknown): value is TableFileCollection {
  return value === 'documents' || value === 'reports';
}

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return DOCUMENT_CATEGORIES.includes(value as DocumentCategory);
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/** O tipo vindo da extensão; `null` = formato não aceito (vídeo, wav, exe…). */
export function sourceMimeForFile(
  fileName: string,
  kind: TableFileKind
): string | null {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? '';
  const map =
    kind === 'documento' ? DOCUMENT_MIME_BY_EXTENSION : REPORT_MIME_BY_EXTENSION;
  return Object.prototype.hasOwnProperty.call(map, extension) ? map[extension] : null;
}

export function storedMimesFor(kind: TableFileKind): string[] {
  return kind === 'documento' ? DOCUMENT_MIMES : REPORT_MIMES;
}

export function maxBytesForMime(mime: string): number {
  if (mime.startsWith('image/')) return IMAGE_MAX_BYTES;
  if (mime.startsWith('audio/')) return AUDIO_MAX_BYTES;
  if (mime === 'application/pdf') return PDF_MAX_BYTES;
  return TEXT_MAX_BYTES;
}

/** Valida o arquivo escolhido no navegador. `null` = pode subir. */
export function validateTableFile(
  file: { name: string; size: number },
  kind: TableFileKind
): string | null {
  const mime = sourceMimeForFile(file.name, kind);
  if (!mime) {
    return kind === 'documento'
      ? 'Formato não aceito. Envie PDF, imagem ou áudio (ogg, mp3, m4a).'
      : 'Formato não aceito. Envie .docx, .pdf, .md ou .txt.';
  }
  const max = maxBytesForMime(mime);
  if (file.size > max) return `Arquivo maior que o limite de ${max / MB} MB.`;
  return null;
}

export function buildTableFilePathname(
  kind: TableFileKind,
  id: string,
  mime: string
): string {
  return `${kind}/${id}.${EXTENSION_BY_MIME[mime] ?? 'bin'}`;
}

function isRequestedPathnameValid(pathname: string, kind: TableFileKind): boolean {
  const prefix = `${kind}/`;
  return (
    pathname.startsWith(prefix) &&
    /^[0-9a-f-]{36}\.[a-z0-9]+$/.test(pathname.slice(prefix.length))
  );
}

/** Jogador só cria referência; a mestra, qualquer categoria. Relatório não tem categoria. */
export function canUploadToCategory(
  role: TableUploadRole,
  kind: TableFileKind,
  category: unknown
): boolean {
  if (kind === 'relatorio') return true;
  if (!isDocumentCategory(category)) return false;
  return role === 'gm' || category === 'referencia';
}

/** Regras do token de upload. `string` = motivo da recusa. */
export function tableFileUploadRules(
  input: {
    kind: TableFileKind;
    role: TableUploadRole;
    category: unknown;
    mime: unknown;
    pathname: string;
  }
): { allowedContentTypes: string[]; maximumSizeInBytes: number } | string {
  const { kind, role, category, mime, pathname } = input;
  if (!canUploadToCategory(role, kind, category)) {
    return 'Sem permissão para enviar nesta categoria.';
  }
  if (typeof mime !== 'string' || !storedMimesFor(kind).includes(mime)) {
    return 'Formato de arquivo não permitido.';
  }
  if (!isRequestedPathnameValid(pathname, kind)) {
    return 'Caminho de arquivo inválido.';
  }
  return {
    allowedContentTypes: [mime],
    maximumSizeInBytes: maxBytesForMime(mime),
  };
}

export function statusForRole(role: TableUploadRole): DocumentStatus {
  return role === 'gm' ? 'approved' : 'pending';
}

export function sanitizeTitle(title: string): string {
  return (title.trim() || 'Sem título').slice(0, 120);
}

export function titleFromFile(fileName: string): string {
  return sanitizeTitle(fileName.replace(/\.[^.]+$/, ''));
}

export function viewerKindForMime(mime: string): ViewerKind | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/markdown') return 'markdown';
  if (mime === 'text/plain') return 'text';
  if (mime === DOCX_MIME) return 'docx';
  return null;
}

/** Nome do arquivo baixado: o título, sem o que o sistema de arquivos recusa. */
export function downloadName(title: string, mime: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, '_');
  const extension = EXTENSION_BY_MIME[mime];
  return extension ? `${safe}.${extension}` : safe;
}

/** Só o que a mestra mostrou desde a última leitura: o mais recente abre. */
export function newlyShownDocument(
  documents: TableDocument[],
  baseline: number
): TableDocument | null {
  let latest: TableDocument | null = null;
  let latestAt = baseline;
  for (const document of documents) {
    const at = document.shown_at ? Date.parse(document.shown_at) : 0;
    if (at > latestAt && document.status === 'approved') {
      latest = document;
      latestAt = at;
    }
  }
  return latest;
}

export function latestShownAt(documents: TableDocument[]): number {
  return documents.reduce(
    (latest, document) =>
      Math.max(latest, document.shown_at ? Date.parse(document.shown_at) : 0),
    0
  );
}

export function visibleDocuments(
  documents: TableDocument[],
  category: DocumentCategory | null,
  userId: string | null
): TableDocument[] {
  return documents.filter(
    (document) =>
      (category === null || document.category === category) &&
      (document.status === 'approved' || document.uploaded_by === userId)
  );
}

export function countPendingDocuments(documents: TableDocument[] | null): number {
  return documents?.filter((document) => document.status === 'pending').length ?? 0;
}

export function canDeleteTableFile(
  ownerId: string | null,
  userId: string,
  isGm: boolean
): boolean {
  return isGm || ownerId === userId;
}

/** .txt salvo pelo Bloco de Notas antigo vem em Windows-1252, e os acentos quebrariam. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Limita o deslocamento: menor que a janela centraliza; maior não deixa sobra. */
export function clampPan(offset: number, content: number, viewport: number): number {
  if (content <= viewport) return (viewport - content) / 2;
  return Math.min(0, Math.max(viewport - content, offset));
}

/** Novo deslocamento para o ponto sob `focus` continuar no mesmo lugar ao mudar a escala. */
export function panForZoom(
  offset: number,
  focus: number,
  scale: number,
  nextScale: number
): number {
  return focus - ((focus - offset) / scale) * nextScale;
}

/** Escala do canvas do PDF: nitidez para o zoom, com teto de memória no tablet. */
export function pdfRenderScale(
  fitScale: number,
  devicePixelRatio: number,
  pageWidth: number,
  pageHeight: number,
  maxPixels: number
): number {
  const wanted = fitScale * Math.min(devicePixelRatio, 2) * 1.5;
  return Math.min(wanted, Math.sqrt(maxPixels / (pageWidth * pageHeight)));
}
