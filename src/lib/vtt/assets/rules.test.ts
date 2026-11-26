import { describe, expect, it } from 'vitest';
import {
  blobHostFromToken,
  buildAssetPathname,
  buildThumbPathname,
  canDeleteAsset,
  deletableAssetUrls,
  fitWithin,
  hasThumb,
  isRequestedPathnameValid,
  isRequestedThumbPathnameValid,
  isUrlFromHost,
  libraryImageUrl,
  matchesSearch,
  maxSideForKind,
  parseTags,
  suggestKind,
  uploadErrorMessage,
  validateSourceFile,
} from './rules';

const MB = 1024 * 1024;
const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('fitWithin', () => {
  it('não amplia imagem menor que o limite', () => {
    expect(fitWithin(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });

  it('reduz pelo maior lado mantendo a proporção', () => {
    expect(fitWithin(8192, 4096, 4096)).toEqual({ width: 4096, height: 2048 });
    expect(fitWithin(1000, 2000, 512)).toEqual({ width: 256, height: 512 });
  });

  it('nunca chega a zero em imagem muito estreita', () => {
    expect(fitWithin(10000, 1, 512)).toEqual({ width: 512, height: 1 });
  });

  it('segue o limite de cada tipo', () => {
    expect(maxSideForKind('mapa')).toBe(4096);
    expect(maxSideForKind('token')).toBe(512);
    expect(maxSideForKind('addon')).toBe(512);
    expect(maxSideForKind('adereco')).toBe(1024);
  });
});

describe('suggestKind', () => {
  it('sugere pelo mime e pela largura', () => {
    expect(suggestKind('image/png', 2001)).toBe('mapa');
    expect(suggestKind('image/png', 2000)).toBe('token');
    expect(suggestKind('audio/mpeg', null)).toBe('audio_ambiente');
    expect(suggestKind('video/mp4', null)).toBe('cutscene');
    expect(suggestKind('application/pdf', null)).toBeNull();
  });
});

describe('validateSourceFile', () => {
  it('aplica o limite por tipo', () => {
    expect(validateSourceFile({ type: 'image/png', size: 15 * MB }, 'mapa')).toBeNull();
    expect(validateSourceFile({ type: 'image/png', size: 15 * MB + 1 }, 'mapa')).toContain('15 MB');
    expect(validateSourceFile({ type: 'audio/ogg', size: 8 * MB + 1 }, 'audio_sfx')).toContain('8 MB');
    expect(validateSourceFile({ type: 'video/mp4', size: 40 * MB + 1 }, 'cutscene')).toContain('40 MB');
  });

  it('recusa WAV e tipo que não combina', () => {
    expect(validateSourceFile({ type: 'audio/wav', size: 1 }, 'audio_sfx')).toContain('WAV');
    expect(validateSourceFile({ type: 'image/png', size: 1 }, 'cutscene')).toContain('Formato');
    expect(validateSourceFile({ type: 'image/svg+xml', size: 1 }, 'token')).toContain('Formato');
  });
});

describe('pathname', () => {
  it('monta e valida o caminho pedido', () => {
    const pathname = buildAssetPathname('token', UUID, 'image/webp');
    expect(pathname).toBe(`token/${UUID}.webp`);
    expect(isRequestedPathnameValid(pathname, 'token')).toBe(true);
  });

  it('recusa caminho de outro tipo ou com subpasta', () => {
    expect(isRequestedPathnameValid(`mapa/${UUID}.webp`, 'token')).toBe(false);
    expect(isRequestedPathnameValid(`token/../${UUID}.webp`, 'token')).toBe(false);
  });
});

describe('miniatura', () => {
  it('só mapa e adereço têm arquivo próprio de miniatura', () => {
    expect(hasThumb('mapa')).toBe(true);
    expect(hasThumb('adereco')).toBe(true);
    expect(hasThumb('token')).toBe(true);
    expect(hasThumb('addon')).toBe(true);
    expect(hasThumb('audio_sfx')).toBe(false);
    expect(hasThumb('cutscene')).toBe(false);
  });

  it('caminho fica em thumbs/ e não vale como arquivo principal', () => {
    const pathname = buildThumbPathname('mapa', UUID, 'image/webp');
    expect(pathname).toBe(`thumbs/mapa/${UUID}.webp`);
    expect(isRequestedThumbPathnameValid(pathname, 'mapa')).toBe(true);
    expect(isRequestedThumbPathnameValid(pathname, 'adereco')).toBe(false);
    expect(isRequestedPathnameValid(pathname, 'mapa')).toBe(false);
    expect(isRequestedThumbPathnameValid(`mapa/${UUID}.webp`, 'mapa')).toBe(false);
  });

  it('a biblioteca nunca baixa o mapa cheio', () => {
    const full = 'https://x/full.webp';
    const thumb = 'https://x/thumbs/t.webp';
    expect(libraryImageUrl({ kind: 'mapa', url: full, thumb_url: thumb })).toBe(thumb);
    expect(libraryImageUrl({ kind: 'mapa', url: full, thumb_url: null })).toBeNull();
    expect(libraryImageUrl({ kind: 'token', url: full, thumb_url: null })).toBeNull();
    expect(libraryImageUrl({ kind: 'token', url: full, thumb_url: thumb })).toBe(thumb);
    expect(libraryImageUrl({ kind: 'audio_sfx', url: full, thumb_url: null })).toBeNull();
  });
});

describe('blob host', () => {
  it('sai do token em minúsculas', () => {
    expect(blobHostFromToken('vercel_blob_rw_AbC123_segredo')).toBe(
      'abc123.public.blob.vercel-storage.com'
    );
    expect(blobHostFromToken('outra-coisa')).toBeNull();
  });

  it('confere o host exato', () => {
    const host = 'abc.public.blob.vercel-storage.com';
    expect(isUrlFromHost(`https://${host}/token/a.webp`, host)).toBe(true);
    expect(isUrlFromHost(`http://${host}/a.webp`, host)).toBe(false);
    expect(isUrlFromHost(`https://${host}.evil.com/a.webp`, host)).toBe(false);
    expect(isUrlFromHost('lixo', host)).toBe(false);
  });
});

describe('parseTags', () => {
  it('limpa, normaliza e tira repetidas', () => {
    expect(parseTags(' Floresta, noite,,floresta ')).toEqual(['floresta', 'noite']);
  });
});

describe('matchesSearch', () => {
  const asset = { name: 'Taverna Velha', tags: ['interior', 'noite'] };

  it('procura em nome e tags sem diferenciar caixa', () => {
    expect(matchesSearch(asset, 'taverna')).toBe(true);
    expect(matchesSearch(asset, 'NOI')).toBe(true);
    expect(matchesSearch(asset, 'floresta')).toBe(false);
    expect(matchesSearch(asset, '  ')).toBe(true);
  });
});

describe('canDeleteAsset', () => {
  it('jogador só apaga o próprio pendente', () => {
    expect(canDeleteAsset({ status: 'pending', uploaded_by: 'a' }, 'a', false)).toBe(true);
    expect(canDeleteAsset({ status: 'approved', uploaded_by: 'a' }, 'a', false)).toBe(false);
    expect(canDeleteAsset({ status: 'pending', uploaded_by: 'b' }, 'a', false)).toBe(false);
  });

  it('mestra apaga qualquer um', () => {
    expect(canDeleteAsset({ status: 'approved', uploaded_by: 'b' }, 'a', true)).toBe(true);
  });
});

describe('uploadErrorMessage', () => {
  it('traduz os erros conhecidos do Blob', () => {
    expect(uploadErrorMessage('Vercel Blob: This store has been suspended.')).toContain('cota');
    expect(uploadErrorMessage('Vercel Blob: File is too large')).toContain('limite');
    expect(uploadErrorMessage('Failed to  retrieve the client token')).toContain('recusou');
    expect(uploadErrorMessage('x')).toContain('Tente de novo');
  });
});

describe('deletableAssetUrls', () => {
  const HOST = 'https://abc.public.blob.vercel-storage.com/';
  const owns = (url: string) => url.startsWith(HOST);

  it('apaga arquivo e miniatura da pasta do tipo', () => {
    expect(
      deletableAssetUrls(
        { kind: 'token', url: `${HOST}token/a.webp`, thumb_url: `${HOST}thumbs/token/a.webp` },
        owns
      )
    ).toEqual([`${HOST}token/a.webp`, `${HOST}thumbs/token/a.webp`]);
  });

  it('não apaga documento, relatório, outro tipo nem outro storage', () => {
    for (const url of [
      `${HOST}documento/carta.pdf`,
      `${HOST}relatorio/r.md`,
      `${HOST}mapa/m.webp`,
      `${HOST}token/../documento/carta.pdf`,
      'https://outro.public.blob.vercel-storage.com/token/a.webp',
    ]) {
      expect(deletableAssetUrls({ kind: 'token', url, thumb_url: null }, owns)).toEqual([]);
    }
  });
});
