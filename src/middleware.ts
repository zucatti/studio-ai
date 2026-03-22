import { NextResponse, NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  // Fix protocol detection behind reverse proxy (Cloudflare/nginx)
  // Clone headers and ensure X-Forwarded-Proto is set to https in production
  const headers = new Headers(request.headers);
  if (process.env.NODE_ENV === 'production') {
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-forwarded-host', request.headers.get('host') || '');
  }

  // Create a new request with the fixed headers
  const fixedRequest = new NextRequest(request.url, {
    method: request.method,
    headers,
    body: request.body,
  });

  try {
    return await auth0.middleware(fixedRequest);
  } catch (error) {
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
