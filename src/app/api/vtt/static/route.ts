import { NextResponse, type NextRequest } from 'next/server';
import {
  catalogFor,
  readStaticAccess,
  takeColdStart,
} from '@/lib/vtt/assets/manifest.server';

export const dynamic = 'force-dynamic';

/**
 * O catálogo por papel. `Vary: Cookie`: quem trocar de conta no mesmo navegador
 * não pode receber do cache a lista da mestra.
 */
export async function GET(request: NextRequest) {
  const start = performance.now();
  const cold = takeColdStart();
  const access = await readStaticAccess();
  if (!access) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  }
  const authDone = performance.now();
  const { body, etag } = await catalogFor(access.isMestre);
  const headers = {
    'Cache-Control': 'private, max-age=60',
    ETag: etag,
    Vary: 'Cookie',
    'Server-Timing': `auth;dur=${(authDone - start).toFixed(1)}, manifest;dur=${(
      performance.now() - authDone
    ).toFixed(1)}${cold ? ', cold' : ''}`,
  };
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(body, {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
