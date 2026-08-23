import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in Vercel → Settings → Environment Variables.'
    );
    return new NextResponse(
      'Configuração incompleta: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no painel da Vercel.',
      { status: 503 }
    );
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        supabaseResponse = NextResponse.next({ request });
        supabaseResponse.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        supabaseResponse = NextResponse.next({ request });
        supabaseResponse.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === '/login' || path === '/cadastro';
  const isPublicLanding = path === '/';
  const isProtected =
    path.startsWith('/fichas') ||
    path.startsWith('/lore') ||
    path.startsWith('/regras') ||
    path.startsWith('/rolagens');

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/fichas';
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isPublicLanding) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/fichas';
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
