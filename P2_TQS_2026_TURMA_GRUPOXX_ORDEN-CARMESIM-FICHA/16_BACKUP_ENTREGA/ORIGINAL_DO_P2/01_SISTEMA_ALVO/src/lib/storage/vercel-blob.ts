import {
  BlobAccessError,
  BlobNotFoundError,
  BlobStoreSuspendedError,
  del,
  head,
} from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { blobHostFromToken, isUrlFromHost } from '@/lib/vtt/assets/rules';
import { StorageError, type StorageProvider } from './types';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Sempre o token: sem isso o SDK prefere OIDC quando há `BLOB_STORE_ID` no ambiente,
 * e o upload (que só usa o token) e o `del` acabam com credenciais diferentes.
 */
function credentials() {
  return { token: process.env.BLOB_READ_WRITE_TOKEN };
}

function deleteErrorMessage(error: unknown): string {
  if (error instanceof BlobAccessError) {
    return 'O Blob recusou a credencial. Confira BLOB_READ_WRITE_TOKEN na Vercel.';
  }
  if (error instanceof BlobStoreSuspendedError) {
    return 'A cota do Blob estourou este mês. Apagar volta quando o mês virar.';
  }
  return 'Não foi possível apagar o arquivo. Tente de novo.';
}

export const vercelBlobStorage: StorageProvider = {
  isConfigured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),

  createUploadToken: (request, body, authorize) =>
    handleUpload({
      request,
      body: body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => ({
        ...(await authorize(pathname, clientPayload)),
        addRandomSuffix: true,
        allowOverwrite: false,
        cacheControlMaxAge: ONE_YEAR_SECONDS,
      }),
    }),

  ownsUrl: (url) => {
    const host = blobHostFromToken(process.env.BLOB_READ_WRITE_TOKEN ?? '');
    return host !== null && isUrlFromHost(url, host);
  },

  stat: async (url) => {
    try {
      const { size, contentType, pathname } = await head(url, credentials());
      return { size, contentType, pathname };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },

  delete: async (urls) => {
    try {
      await del(urls, credentials());
    } catch (error) {
      throw new StorageError(deleteErrorMessage(error), { cause: error });
    }
  },
};
