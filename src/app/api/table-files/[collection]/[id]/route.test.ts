import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  delete: vi.fn(),
}));
const getTableFileAccess = vi.hoisted(() => vi.fn());

vi.mock('@/lib/storage', async () => {
  const { StorageError } = await import('@/lib/storage/types');
  return { storage, StorageError };
});
vi.mock('@/lib/vtt/docs/server', () => ({ getTableFileAccess }));

import { DELETE } from './route';

const ID = 'f0000000-0000-4000-8000-000000000001';
const FILE = 'https://abc.public.blob.vercel-storage.com/documento/a.pdf';

function session(row: unknown, role: string | null) {
  const remove = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  return {
    userId: 'u1',
    remove,
    supabase: {
      rpc: async () => ({ data: role }),
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row }) }),
        }),
        delete: remove,
      }),
    },
  };
}

const run = (collection = 'documents', id = ID) =>
  DELETE(new Request('http://x', { method: 'DELETE' }), {
    params: { collection, id },
  });

const OTHERS = { url: FILE, table_id: 't', uploaded_by: 'u2' };

describe('DELETE /api/table-files/[collection]/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.isConfigured.mockReturnValue(true);
    storage.delete.mockResolvedValue(undefined);
  });

  it('mestra apaga o de qualquer pessoa', async () => {
    const value = session(OTHERS, 'gm');
    getTableFileAccess.mockResolvedValue(value);
    expect((await run()).status).toBe(200);
    expect(storage.delete).toHaveBeenCalledWith([FILE]);
    expect(value.remove).toHaveBeenCalled();
  });

  it('jogador apaga o próprio, mesmo aprovado', async () => {
    getTableFileAccess.mockResolvedValue(
      session({ url: FILE, table_id: 't', author_id: 'u1' }, 'player')
    );
    expect((await run('reports')).status).toBe(200);
  });

  it('jogador não apaga o dos outros e não toca no storage', async () => {
    getTableFileAccess.mockResolvedValue(session(OTHERS, 'player'));
    expect((await run()).status).toBe(403);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('Blob recusou: mantém a linha', async () => {
    const value = session(OTHERS, 'gm');
    getTableFileAccess.mockResolvedValue(value);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storage.delete.mockRejectedValue(new Error('segredo interno'));
    const res = await run();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('segredo');
    expect(value.remove).not.toHaveBeenCalled();
  });

  it('coleção e id inválidos: 404', async () => {
    expect((await run('assets')).status).toBe(404);
    expect((await run('documents', 'x')).status).toBe(404);
  });

  it('sem sessão: 401', async () => {
    getTableFileAccess.mockResolvedValue(null);
    expect((await run()).status).toBe(401);
  });
});
