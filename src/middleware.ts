import { NextResponse, NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  try {
    // Behind Cloudflare/nginx: rewrite URL to HTTPS before Auth0 processes it
    if (process.env.NODE_ENV === 'production') {
      const url = new URL(request.url);
      if (url.protocol === 'http:') {
        url.protocol = 'https:';
        const httpsRequest = new NextRequest(url.toString(), request);
        return await auth0.middleware(httpsRequest);
      }
    }

    return await auth0.middleware(request);
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
