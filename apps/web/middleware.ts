import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function securityPolicy(nonce: string, secureTransport: boolean): string {
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self' https://login.microsoftonline.com`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // Next emits critical CSS and some framework styles inline. Script execution
    // is nonce-gated below; styles remain self/inline until all generated style
    // tags can be nonce-propagated consistently across supported Next versions.
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `connect-src 'self'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    ...(secureTransport ? [`upgrade-insecure-requests`] : []),
  ].join('; ');
}

function secureResponse(response: NextResponse, csp: string, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  // Useful to server components for explicitly-nonced first-paint scripts.
  response.headers.set('x-concord-nonce', nonce);
  return response;
}

/** Gate application pages behind the HttpOnly session cookie. */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = securityPolicy(nonce, req.nextUrl.protocol === 'https:');
  const token = req.cookies.get('concord_token')?.value;
  const isLogin = req.nextUrl.pathname.startsWith('/login');

  if (!token && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return secureResponse(NextResponse.redirect(url), csp, nonce);
  }

  if (token && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return secureResponse(NextResponse.redirect(url), csp, nonce);
  }

  // Forward both the nonce and CSP on the request. Next's App Router reads the
  // nonce from the request CSP and applies it to framework-generated scripts.
  // Merely setting CSP on the response would block those bootstrap scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return secureResponse(response, csp, nonce);
}

/**
 * Static assets and same-origin /api rewrites are not page-gated here. The API
 * has its own global authentication/RBAC guard, and auth/SSO endpoints must be
 * reachable before a browser has a session cookie. Keeping /api out of this
 * matcher also prevents middleware redirects from changing POST semantics.
 */
export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf)$).*)',
  ],
};
