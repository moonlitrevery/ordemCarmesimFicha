import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Os originais têm nome previsível: só as cópias de _built/ são servidas.
  if (request.nextUrl.pathname.startsWith('/vtt/')) {
    return new NextResponse(null, { status: 404 });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // A lista de fixos confere a sessão ela mesma: aqui pagaria uma ida a mais ao Supabase.
    '/((?!_next/static|_next/image|vtt/|pdfjs/|api/vtt/static|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/vtt/((?!_built/).*)',
  ],
};
