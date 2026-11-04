import { describe, expect, it } from 'vitest';
import { isStaticAsset, libraryImageUrl, type Asset } from './rules';
import {
  assetsOfKind,
  isBackfillCandidate,
  mergeLibrary,
  staticItemToAsset,
  visibleStaticItems,
  type StaticManifestItem,
} from './static';

const ITEM: StaticManifestItem = {
  id: '123e4567-e89b-52d3-a456-426614174000',
  kind: 'mapa',
  name: 'Mansão',
  visibility: 'mestre',
  path: '/vtt/_built/abc.webp',
  thumb: '/vtt/_built/abc-thumb.webp',
  mime: 'image/webp',
  size_bytes: 10,
  width: 4096,
  height: 2048,
  duration_s: null,
};

describe('staticItemToAsset', () => {
  it('vira um asset aprovado, sem dono, com a miniatura do manifest', () => {
    const asset = staticItemToAsset(ITEM);
    expect(asset.status).toBe('approved');
    expect(asset.visibility).toBe('mestre');
    expect(asset.uploaded_by).toBeNull();
    expect(asset.tags).toEqual([]);
    expect(libraryImageUrl(asset)).toBe(ITEM.thumb);
  });
});

describe('visibleStaticItems', () => {
  const secret = ITEM;
  const open = { ...ITEM, id: 'open', visibility: 'jogadores' as const };
  const used = { ...ITEM, id: 'used' };
  const all = [secret, open, used];

  it('mestra vê tudo', () => {
    expect(visibleStaticItems(all, true, [])).toEqual(all);
  });

  it('jogador vê só o liberado e o que está em uso na cena dele', () => {
    expect(visibleStaticItems(all, false, ['used'])).toEqual([open, used]);
  });

  it('id em uso que não está no manifest não inventa item', () => {
    expect(visibleStaticItems([secret], false, ['outro'])).toEqual([]);
  });
});

describe('isStaticAsset', () => {
  it('reconhece só URL relativa de /vtt/', () => {
    expect(isStaticAsset({ url: '/vtt/_built/abc.webp' })).toBe(true);
    expect(
      isStaticAsset({
        url: 'https://abc.public.blob.vercel-storage.com/vtt/mapa.webp',
      })
    ).toBe(false);
  });
});

describe('mergeLibrary', () => {
  it('põe os do Blob antes, tira repetidos, e o painel filtra pelo tipo', () => {
    const uploaded = { ...staticItemToAsset(ITEM), id: 'blob' } as Asset;
    const map = staticItemToAsset(ITEM);
    const token = staticItemToAsset({ ...ITEM, id: 't', kind: 'token' });
    const merged = mergeLibrary([uploaded], [map, token], [map]);
    expect(merged.map((a) => a.id)).toEqual(['blob', ITEM.id, token.id]);
    expect(assetsOfKind(merged, 'token').map((a) => a.id)).toEqual([token.id]);
  });

  it('só asset do Blob, de imagem e sem miniatura entra na fila de miniaturas', () => {
    const blob = {
      ...staticItemToAsset(ITEM),
      kind: 'token',
      thumb_url: null,
      url: 'https://x/a.webp',
    } as Asset;
    expect(isBackfillCandidate(blob)).toBe(true);
    expect(isBackfillCandidate({ ...blob, thumb_url: 'https://x/thumbs/a.webp' })).toBe(false);
    expect(isBackfillCandidate({ ...blob, kind: 'audio_sfx' })).toBe(false);
    expect(isBackfillCandidate({ ...blob, url: '/vtt/_built/a.webp' })).toBe(false);
  });
});
