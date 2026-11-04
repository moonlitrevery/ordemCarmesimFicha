import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StorageError } from './types';
import { vercelBlobStorage } from './vercel-blob';

const TOKEN = 'vercel_blob_rw_abc123_segredo';
const URLS = ['https://abc123.public.blob.vercel-storage.com/token/a.webp'];

// O SDK só aceita OIDC com cara de JWT; a assinatura nem é conferida aqui.
const segment = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const OIDC = `${segment({ alg: 'none' })}.${segment({ exp: 4102444800, sub: 'x' })}.sig`;

let server: http.Server;
let seen: (string | undefined)[] = [];
let status = 200;
let errorCode = 'forbidden';
const saved = { ...process.env };

beforeAll(async () => {
  server = http.createServer((request, response) => {
    seen.push(request.headers.authorization);
    response.statusCode = status;
    response.setHeader('content-type', 'application/json');
    response.end(
      status === 200 ? '{}' : JSON.stringify({ error: { code: errorCode, message: 'x' } })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${port}`;
  process.env.VERCEL_BLOB_RETRIES = '0';
  process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
});

afterAll(() => {
  server.close();
  process.env = saved;
});

beforeEach(() => {
  seen = [];
  status = 200;
  errorCode = 'forbidden';
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.BLOB_STORE_ID;
});

describe('vercelBlobStorage.delete', () => {
  it('usa o token mesmo com OIDC e BLOB_STORE_ID no ambiente', async () => {
    process.env.VERCEL_OIDC_TOKEN = OIDC;
    process.env.BLOB_STORE_ID = 'store_outro';
    await vercelBlobStorage.delete(URLS);
    expect(seen).toEqual([`Bearer ${TOKEN}`]);
  });

  it('credencial recusada vira uma mensagem que diz o que conferir', async () => {
    status = 403;
    await expect(vercelBlobStorage.delete(URLS)).rejects.toThrow(
      /BLOB_READ_WRITE_TOKEN/
    );
    await expect(vercelBlobStorage.delete(URLS)).rejects.toBeInstanceOf(StorageError);
  });

  it('cota estourada avisa quando volta', async () => {
    status = 403;
    errorCode = 'store_suspended';
    await expect(vercelBlobStorage.delete(URLS)).rejects.toThrow(/cota/);
  });
});
