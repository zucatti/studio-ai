import { NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  // Debug logging
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/auth/')) {
    console.log(`[Auth] ${request.method} ${pathname}${request.nextUrl.search}`);
  }

  return auth0.middleware(request);
}

export const config = {
  matcher: [
    // Exclude static files, upload API, and other static assets
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/upload).*)"
  ]
};
