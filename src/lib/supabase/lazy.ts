// O cliente do Supabase pesa ~60 KB gz. Em tela que só fala com o banco depois
// de montar ou de um clique, ele fica fora do primeiro carregamento.

const load = () => import('./client');

/** Cliente do navegador, carregado sob demanda. */
export function loadSupabase() {
  return load().then(({ createClient }) => createClient());
}

/**
 * Baixa o módulo quando o navegador ficar ocioso, para o primeiro clique não
 * esperar a rede. Chame num `useEffect`.
 */
export function preloadSupabase(): () => void {
  if (typeof window === 'undefined') return () => {};
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(() => void load(), { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const t = setTimeout(() => void load(), 1500);
  return () => clearTimeout(t);
}
