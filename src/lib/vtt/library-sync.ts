import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareThumb } from './assets/prepare-image';
import { isImageKind, libraryImageUrl, type Asset } from './assets/rules';
import { fetchLibraryAssets, isBackfillCandidate } from './assets/static';
import { registerThumb, uploadThumb } from './assets/upload';
import { perfEnabled, perfResources, perfTime } from './perf';
import type { TableChannel } from './realtime';
import { useVttStore } from './store';

const REFRESH_DELAY_MS = 300;
const IDLE_FALLBACK_MS = 800;
/** O que cabe na primeira tela do painel: quem abrir já encontra no cache. */
const PRELOAD_THUMBS = 14;

function store() {
  return useVttStore.getState();
}

export function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, IDLE_FALLBACK_MS);
  return () => clearTimeout(id);
}

/**
 * A lista vive no store: carrega uma vez em segundo plano e só relê por evento.
 * Abrir o painel, trocar de aba ou buscar não faz requisição.
 */
export class LibrarySync {
  private cleanup: (() => void)[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private ticket = 0;
  private stopped = false;
  private backfilling = false;
  private backfillFailed = new Set<string>();

  constructor(
    private supabase: SupabaseClient,
    private channel: TableChannel,
    private isGm: boolean
  ) {}

  start() {
    this.cleanup.push(
      whenIdle(() => void this.load()),
      // Apagar um arquivo chega como scene:assign, junto com mudar de cena.
      this.channel.on('scene:assign', () => this.scheduleRefresh()),
      useVttStore.subscribe((state, prev) => {
        if (state.libraryVersion !== prev.libraryVersion) this.scheduleRefresh();
        // O que o jogador vê inclui o que está em uso na cena dele.
        if (!this.isGm && state.viewedSceneId !== prev.viewedSceneId) {
          this.scheduleRefresh();
        }
      })
    );
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.refreshTimer);
    this.cleanup.forEach((remove) => remove());
    this.cleanup = [];
  }

  private scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.load(), REFRESH_DELAY_MS);
  }

  /** Também roda a cada reconexão: o que mudou enquanto estava fora. */
  async load() {
    const ticket = ++this.ticket;
    const start = performance.now();
    const { assets, error } = await fetchLibraryAssets(this.supabase, this.isGm);
    if (this.stopped || ticket !== this.ticket) return;
    // Falha ao atualizar não apaga a lista que já está na tela.
    useVttStore.setState((s) => ({
      library: error && s.library ? s.library : assets,
      libraryError: error,
    }));
    if (perfEnabled()) {
      perfTime(`biblioteca carregada (${assets.length} itens)`, start);
      perfResources('rede da biblioteca', start);
    }
    this.preloadThumbs(assets);
    if (this.isGm) void this.backfillThumbs();
  }

  private preloadThumbs(assets: Asset[]) {
    assets
      .filter((asset) => asset.kind === 'token')
      .slice(0, PRELOAD_THUMBS)
      .forEach((asset) => {
        const url = libraryImageUrl(asset);
        if (url) new Image().src = url;
      });
  }

  /** Um por vez e em segundo plano: a mesa não pode pagar por arquivo antigo. */
  private async backfillThumbs() {
    if (this.backfilling) return;
    this.backfilling = true;
    try {
      for (;;) {
        const next = (store().library ?? []).find(
          (asset) =>
            isBackfillCandidate(asset) && !this.backfillFailed.has(asset.id)
        );
        if (!next || this.stopped) return;
        const thumbUrl = await this.makeThumb(next).catch(() => null);
        if (this.stopped) return;
        if (!thumbUrl) {
          this.backfillFailed.add(next.id);
          continue;
        }
        this.patch(next.id, { thumb_url: thumbUrl });
      }
    } finally {
      this.backfilling = false;
    }
  }

  private async makeThumb(asset: Asset): Promise<string | null> {
    if (!isImageKind(asset.kind)) return null;
    const res = await fetch(asset.url);
    if (!res.ok) return null;
    const thumb = await prepareThumb(await res.blob());
    return registerThumb(asset.id, await uploadThumb(asset.kind, thumb));
  }

  patch(id: string, change: Partial<Asset>) {
    useVttStore.setState((s) => ({
      library:
        s.library?.map((asset) =>
          asset.id === id ? { ...asset, ...change } : asset
        ) ?? null,
    }));
  }

  remove(id: string) {
    useVttStore.setState((s) => ({
      library: s.library?.filter((asset) => asset.id !== id) ?? null,
    }));
  }
}
