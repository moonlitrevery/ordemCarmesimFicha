import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageError } from '@/lib/storage/types';

const storage = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  delete: vi.fn(),
}));
const getUploadAccess = vi.hoisted(() => vi.fn());

vi.mock('@/lib/storage', async () => {
  const { StorageError: Error } = await import('@/lib/storage/types');
  return { storage, StorageError: Error };
});
vi.mock('@/lib/vtt/assets/server', () => ({ getUploadAccess }));

import { DELETE } from './route';

const ID = 'f0000000-0000-4000-8000-000000000001';
const FILE = 'https://abc.public.blob.vercel-storage.com/mapa/a.webp';
const THUMB = 'https://abc.public.blob.vercel-storage.com/thumbs/mapa/a.webp';

function access(
  asset: unknown,
  { isMestre = true, deleteError = null as unknown } = {}
) {
  const remove = vi.fn(() => ({ eq: async () => ({ error: deleteError }) }));
  return {
    userId: 'u1',
    isMestre,
    remove,
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: asset }) }),
        }),
        delete: remove,
      }),
    },
  };
}

const run = () =>
  DELETE(new Request('http://x', { method: 'DELETE' }), { params: { id: ID } });

const APPROVED = { url: FILE, thumb_url: THUMB, status: 'approved', uploaded_by: 'u2' };

describe('DELETE /api/upload/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storage.isConfigured.mockReturnValue(true);
    storage.delete.mockResolvedValue(undefined);
  });

  it('mestra apaga o arquivo, a miniatura e a linha', async () => {
    const session = access(APPROVED);
    getUploadAccess.mockResolvedValue(session);
    const res = await run();
    expect(res.status).toBe(200);
    expect(storage.delete).toHaveBeenCalledWith([FILE, THUMB]);
    expect(session.remove).toHaveBeenCalled();
  });

  it('Blob recusou: mantém a linha e devolve o motivo', async () => {
    const session = access(APPROVED);
    getUploadAccess.mockResolvedValue(session);
    storage.delete.mockRejectedValue(new StorageError('Confira o token.'));
    const res = await run();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Confira o token.' });
    expect(session.remove).not.toHaveBeenCalled();
  });

  it('erro inesperado não vaza detalhes para a tela', async () => {
    getUploadAccess.mockResolvedValue(access(APPROVED));
    storage.delete.mockRejectedValue(new Error('segredo interno'));
    const res = await run();
    expect(JSON.stringify(await res.json())).not.toContain('segredo');
  });

  it('jogador não apaga arquivo aprovado', async () => {
    getUploadAccess.mockResolvedValue(access(APPROVED, { isMestre: false }));
    const res = await run();
    expect(res.status).toBe(403);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('arquivo fixo não tem linha: 404, sem tocar no storage', async () => {
    getUploadAccess.mockResolvedValue(access(null));
    const res = await run();
    expect(res.status).toBe(404);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('sem sessão: 401', async () => {
    getUploadAccess.mockResolvedValue(null);
    expect((await run()).status).toBe(401);
  });

  it('sem Blob configurado: diz o que ligar', async () => {
    getUploadAccess.mockResolvedValue(access(APPROVED));
    storage.isConfigured.mockReturnValue(false);
    const res = await run();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Blob/);
  });
});
