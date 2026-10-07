import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/safeNext';

const PROTECTED_ROUTES = ['/dashboard', '/policies', '/advisor', '/impact', '/settings', '/onboarding'];
const AUTH_ROUTES = ['/auth/signin', '/auth/signup'];
const AUTH_TIMEOUT_MS = 3000;

const isProtected = (path: string) => PROTECTED_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Write every refreshed cookie chunk onto one response so none are lost.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Copy refreshed session cookies onto a redirect so the browser keeps them.
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  let user = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('auth timeout')), AUTH_TIMEOUT_MS)),
    ]);
    user = result.data.user;
  } catch (e) {
    // If auth can't be checked, don't bounce signed-in users to the sign-in
    // page; pages and API routes still enforce auth themselves.
    console.error('Middleware auth check failed:', e);
    return response;
  }

  if (!user && isProtected(pathname)) {
    const url = new URL('/auth/signin', request.url);
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return redirectTo(url);
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    const next = safeNextPath(request.nextUrl.searchParams.get('next'));
    return redirectTo(new URL(next || '/dashboard', request.url));
  }

  return response;
}

export const config = {
  // Skip static assets and API routes (which authenticate themselves).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
