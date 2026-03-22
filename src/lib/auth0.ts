import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { cookies, headers } from "next/headers";
import { NextRequest } from "next/server";

const baseUrl = process.env.AUTH0_BASE_URL || 'https://studio.stevencreeks.com';

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_ISSUER_BASE_URL?.replace("https://", ""),
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  secret: process.env.AUTH0_SECRET,
  appBaseUrl: baseUrl,
  routes: {
    callback: '/auth/callback',
    login: '/auth/login',
    logout: '/auth/logout',
  },
  authorizationParameters: {
    redirect_uri: `${baseUrl}/auth/callback`,
  },
});

/**
 * Get session with corrected URL for reverse proxy setup.
 * Uses the configured base URL instead of the internal 0.0.0.0:3000 URL.
 */
export async function getSessionWithProxy() {
  const cookieStore = await cookies();

  // Build cookie header from cookie store
  const cookieHeader = cookieStore.getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  // Create a request with the correct base URL (hardcoded for proxy setup)
  const correctedRequest = new NextRequest(new URL('/', baseUrl), {
    headers: new Headers({
      'cookie': cookieHeader,
    }),
  });

  return auth0.getSession(correctedRequest);
}
