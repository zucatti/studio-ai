import { NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  // Use original request directly - URL correction only needed for reverse proxy in production
  return auth0.middleware(request);
}

export const config = {
  matcher: [
    // Exclude static files, upload API (large file uploads), and other static assets
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/upload).*)"
  ]
};
