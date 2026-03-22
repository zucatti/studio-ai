import { NextResponse, NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  try {
    // Log all incoming requests
    console.log('[Middleware] Request:', {
      path: request.nextUrl.pathname,
      url: request.url,
      proto: request.headers.get('x-forwarded-proto'),
      host: request.headers.get('x-forwarded-host') || request.headers.get('host'),
    });

    const response = await auth0.middleware(request);

    // Log response details for auth routes AND homepage
    if (request.nextUrl.pathname.startsWith('/auth') || request.nextUrl.pathname === '/') {
      console.log('[Middleware] Response:', {
        path: request.nextUrl.pathname,
        status: response.status,
        location: response.headers.get('location'),
        cookies: response.headers.get('set-cookie')?.substring(0, 100),
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
