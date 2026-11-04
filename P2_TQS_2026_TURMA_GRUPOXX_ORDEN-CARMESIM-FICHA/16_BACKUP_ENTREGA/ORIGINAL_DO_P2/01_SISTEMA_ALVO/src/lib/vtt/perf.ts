/**
 * `?debug=perf` na URL da mesa: mede em produção e escreve no console. Sem o
 * parâmetro não faz nada. Imagem do Blob vem com tamanho 0 quando o servidor não
 * manda `Timing-Allow-Origin`; o tempo continua valendo.
 */
let enabled: boolean | null = null;

export function perfEnabled(): boolean {
  if (enabled === null) {
    enabled =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('debug') === 'perf';
  }
  return enabled;
}

const INTERESTING = /\/rest\/v1\/assets|\/api\/vtt\/static|\/thumbs\/|-t96\.webp|\/auth\/v1\/user/;

export function perfResources(label: string, sinceMs = 0) {
  if (!perfEnabled()) return;
  const rows = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((entry) => entry.startTime >= sinceMs && INTERESTING.test(entry.name))
    .map((entry) => ({
      url: entry.name.replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(-48),
      inicio_ms: Math.round(entry.startTime - sinceMs),
      duracao_ms: Math.round(entry.duration),
      espera_servidor_ms: Math.round(entry.responseStart - entry.requestStart),
      bytes: entry.transferSize,
      servidor: entry.serverTiming
        .map((t) => (t.duration ? `${t.name}=${t.duration}ms` : t.name))
        .join(' '),
    }));
  console.groupCollapsed(`[perf] ${label}`);
  console.table(rows);
  console.log(
    `[perf] ${rows.length} requisições, ${rows.reduce((sum, row) => sum + row.bytes, 0)} bytes`
  );
  console.groupEnd();
}

export function perfTime(label: string, sinceMs: number) {
  if (perfEnabled()) {
    console.log(`[perf] ${label}: ${Math.round(performance.now() - sinceMs)} ms`);
  }
}

/** Do clique até o painel estar pintado. */
export function perfPanelOpened(label: string) {
  if (!perfEnabled()) return;
  const start = performance.now();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => perfTime(`${label} aberto`, start))
  );
}
