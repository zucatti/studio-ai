import { NextResponse, NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  const url = new URL(request.url);

  // Log all auth-related requests
  if (url.pathname.startsWith('/auth') || url.pathname.includes('callback')) {
    console.log('[Middleware]', {
      path: url.pathname,
      protocol: url.protocol,
      host: url.host,
      fullUrl: request.url,
      xForwardedProto: request.headers.get('x-forwarded-proto'),
      xForwardedHost: request.headers.get('x-forwarded-host'),
    });
  }

  try {
    // Behind Cloudflare/nginx: rewrite URL to use correct protocol and host
    if (process.env.NODE_ENV === 'production') {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';

      if (forwardedHost && (url.host !== forwardedHost || url.protocol !== `${forwardedProto}:`)) {
        console.log('[Middleware] Rewriting URL:', { from: url.host, to: forwardedHost, proto: forwardedProto });
        url.protocol = `${forwardedProto}:`;
        url.host = forwardedHost;
        const fixedRequest = new NextRequest(url.toString(), request);
        return await auth0.middleware(fixedRequest);
      }
    }

    return await auth0.middleware(request);
  } catch (error) {
    console.error('[Middleware] Auth0 error:', error);

    // Invalid session cookie (e.g., AUTH0_SECRET changed)
    if (error instanceof Error && error.message.includes("JWE")) {
      const response = NextResponse.redirect(new URL("/api/auth/login", request.url));
      response.cookies.delete("appSession");
      return response;
    }
    throw error;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
  ]
};
