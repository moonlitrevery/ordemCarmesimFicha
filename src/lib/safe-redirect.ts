const FALLBACK = '/fichas';

/**
 * Destino do `?next=` depois do login: só caminho deste site. URL de outra origem
 * (`https://…`, `//…`, `/\…`) ou `javascript:` viraria `location.assign` no router.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return FALLBACK;
  }
  // Caractere de controle ou espaço pode ser ignorado pelo navegador e virar `//`.
  if (/[\u0000-\u001f\u007f\s]/.test(next)) return FALLBACK;
  try {
    const base = 'http://ordem.invalid';
    const url = new URL(next, base);
    if (url.origin !== base) return FALLBACK;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return FALLBACK;
  }
}
