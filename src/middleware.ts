import { NextResponse, NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

// Force the base URL for all Auth0 operations
const BASE_URL = process.env.AUTH0_BASE_URL || 'https://studio.stevencreeks.com';

export async function middleware(request: NextRequest) {
  const url = new URL(request.url);

  // Log all auth-related requests
  if (url.pathname.startsWith('/auth') || url.pathname.includes('callback')) {
    console.log('[Middleware]', {
      path: url.pathname,
      fullUrl: request.url,
    });
  }

  try {
    // For auth routes in production, always use the correct base URL
    if (process.env.NODE_ENV === 'production' && url.pathname.startsWith('/auth')) {
      const correctUrl = new URL(url.pathname + url.search, BASE_URL);
      console.log('[Middleware] Auth route, using:', correctUrl.toString());
      const fixedRequest = new NextRequest(correctUrl.toString(), {
        method: request.method,
        headers: request.headers,
        // Don't pass body for GET requests
        ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: request.body } : {}),
      });
      return await auth0.middleware(fixedRequest);
    }

    return await auth0.middleware(request);
  } catch (error) {
    console.error('[Middleware] Auth0 error:', error);

    // Invalid session cookie (e.g., AUTH0_SECRET changed)
    if (error instanceof Error && error.message.includes("JWE")) {
      const response = NextResponse.redirect(new URL("/auth/login", BASE_URL));
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
