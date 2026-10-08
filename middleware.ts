import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/safeNext';

const PROTECTED_ROUTES = ['/dashboard', '/policies', '/advisor', '/impact', '/settings', '/onboarding'];
const AUTH_ROUTES = ['/auth/signin', '/auth/signup'];
const AUTH_TIMEOUT_MS = 3000;
const ONBOARDED_COOKIE = 'pc_onboarded';

function withTimeout<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), AUTH_TIMEOUT_MS)),
  ]);
}

// App pages that only make sense once the financial profile is complete.
const NEEDS_PROFILE = ['/dashboard', '/policies', '/advisor', '/impact'];

const matches = (routes: string[], path: string) => routes.some((r) => path === r || path.startsWith(`${r}/`));
const isProtected = (path: string) => matches(PROTECTED_ROUTES, path);

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
    const result = await withTimeout(supabase.auth.getUser());
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

  // Signed-in users who haven't finished onboarding are sent there first, so
  // no page ever shows numbers for an incomplete profile. Once confirmed, a
  // cookie bound to the user id skips this lookup on later navigations (the
  // API still enforces it on every AI call).
  if (user && matches(NEEDS_PROFILE, pathname) && request.cookies.get(ONBOARDED_COOKIE)?.value !== user.id) {
    try {
      const { data: profile, error } = await withTimeout(
        supabase.from('user_profiles').select('has_completed_onboarding').eq('id', user.id).maybeSingle(),
      );
      if (!error && !profile?.has_completed_onboarding) {
        return redirectTo(new URL('/onboarding', request.url));
      }
      if (!error && profile?.has_completed_onboarding) {
        response.cookies.set(ONBOARDED_COOKIE, user.id, {
          httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 30,
        });
      }
    } catch (e) {
      console.error('Middleware onboarding check failed:', e);
    }
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    // A link error (e.g. an expired or already-used email link) is shown in
    // Settings rather than dropped; Settings works before onboarding too.
    if (request.nextUrl.searchParams.get('error') === 'link_invalid') {
      return redirectTo(new URL('/settings?notice=link_invalid', request.url));
    }
    const next = safeNextPath(request.nextUrl.searchParams.get('next'));
    return redirectTo(new URL(next || '/dashboard', request.url));
  }

  return response;
}

export const config = {
  // Skip static assets and API routes (which authenticate themselves).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
