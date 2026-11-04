import { Assets, type Texture } from 'pixi.js';
import { LruCache } from '../lru';

const UNUSED_TOKEN_TEXTURES = 40;

interface Entry {
  promise: Promise<Texture>;
  refs: number;
}

function unload(url: string) {
  Assets.unload(url).catch(() => undefined);
}

/**
 * SPEC §7.8: textura de token sem uso fica num LRU, para voltar à cena sem baixar
 * de novo; textura de mapa é destruída assim que a cena troca (`keep: false`).
 */
export class TextureStore {
  private entries = new Map<string, Entry>();
  private unused = new LruCache<Entry>(UNUSED_TOKEN_TEXTURES, (_entry, url) =>
    unload(url)
  );

  /** Mipmap só em token: reduzido ele serrilha, e o mapa de 4096 px gastaria +33% de memória. */
  acquire(url: string, mipmaps = false): Promise<Texture> {
    const reused = this.entries.get(url) ?? this.unused.take(url);
    if (reused) {
      reused.refs++;
      this.entries.set(url, reused);
      return reused.promise;
    }
    const entry: Entry = {
      // Parser fixo: a URL do Blob pode não terminar numa extensão conhecida.
      promise: Assets.load<Texture>({
        src: url,
        parser: 'loadTextures',
        data: { autoGenerateMipmaps: mipmaps },
      }),
      refs: 1,
    };
    this.entries.set(url, entry);
    return entry.promise;
  }

  release(url: string, keep: boolean) {
    const entry = this.entries.get(url);
    if (!entry || --entry.refs > 0) return;
    this.entries.delete(url);
    if (keep) {
      this.unused.set(url, entry);
      return;
    }
    void entry.promise.then(
      () => unload(url),
      () => undefined
    );
  }

  destroy() {
    this.unused.clear();
    this.entries.forEach((_entry, url) => unload(url));
    this.entries.clear();
  }
}
