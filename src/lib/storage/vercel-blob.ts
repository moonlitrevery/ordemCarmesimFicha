import { BlobNotFoundError, del, head } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { blobHostFromToken, isUrlFromHost } from '@/lib/vtt/assets/rules';
import type { StorageProvider } from './types';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

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
      const { size, contentType, pathname } = await head(url);
      return { size, contentType, pathname };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },

  delete: (urls) => del(urls),
};
