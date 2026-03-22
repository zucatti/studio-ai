import { NextResponse, NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  try {
    // Get the correct protocol and host from forwarded headers
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost';

    // Create the correct URL using forwarded headers
    const correctUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, `${proto}://${host}`);

    // Log all incoming requests
    const cookieHeader = request.headers.get('cookie');
    console.log('[Middleware] Request:', {
      path: request.nextUrl.pathname,
      originalUrl: request.url,
      correctedUrl: correctUrl.toString(),
      proto,
      host,
      hasCookies: !!cookieHeader,
      sessionCookie: cookieHeader?.includes('__session') ? 'present' : 'missing',
    });

    // Create a new request with the correct URL for Auth0
    const correctedRequest = new NextRequest(correctUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const response = await auth0.middleware(correctedRequest);

    // Log response details for auth routes AND homepage
    if (request.nextUrl.pathname.startsWith('/auth') || request.nextUrl.pathname === '/') {
      const setCookie = response.headers.get('set-cookie');
      console.log('[Middleware] Response:', {
        path: request.nextUrl.pathname,
        status: response.status,
        location: response.headers.get('location'),
        setCookieLength: setCookie?.length,
        setCookiePreview: setCookie?.substring(0, 150),
      });
    }

    return response;
  } catch (error) {
    console.error('[Middleware] ERROR:', error);

    // Return a visible error page instead of crashing
    if (error instanceof Error) {
      return new NextResponse(
        `Auth Error: ${error.message}\n\nStack: ${error.stack}`,
        { status: 500, headers: { 'Content-Type': 'text/plain' } }
      );
    }

    return new NextResponse('Unknown auth error', { status: 500 });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
  ]
};
