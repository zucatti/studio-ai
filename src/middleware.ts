import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  try {
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
