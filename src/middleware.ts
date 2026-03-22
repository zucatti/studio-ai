import { NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  // Get the correct protocol and host from forwarded headers (for reverse proxy)
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost';

  // Create the correct URL using forwarded headers
  const correctUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, `${proto}://${host}`);

  // Create a new request with the correct URL for Auth0
  const correctedRequest = new NextRequest(correctUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  return auth0.middleware(correctedRequest);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
  ]
};
