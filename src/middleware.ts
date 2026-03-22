import { NextResponse, NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  try {
    const response = await auth0.middleware(request);
    console.log('[Middleware] OK:', request.nextUrl.pathname);
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
