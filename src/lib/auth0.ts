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
  // Force cookie domain for reverse proxy setup
  session: {
    cookie: {
      domain: 'studio.stevencreeks.com',
    },
  },
});

/**
 * Get session with corrected URL for reverse proxy setup.
 * Uses the configured base URL instead of the internal 0.0.0.0:3000 URL.
 */
export async function getSessionWithProxy() {
  const cookieStore = await cookies();

  // Build cookie header, filtering out empty cookies and old __session format
  const allCookies = cookieStore.getAll();
  const validCookies = allCookies.filter(c => {
    // Skip empty cookies
    if (!c.value || c.value === '') return false;
    // Skip old __session format (without number suffix) - only use chunked format
    if (c.name === '__session') return false;
    return true;
  });

  const cookieHeader = validCookies
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  console.log('[getSessionWithProxy] Cookies:', {
    total: allCookies.length,
    valid: validCookies.length,
    names: validCookies.map(c => c.name),
  });

  // Create a request with the correct base URL (hardcoded for proxy setup)
  const correctedRequest = new NextRequest(new URL('/', baseUrl), {
    headers: new Headers({
      'cookie': cookieHeader,
    }),
  });

  const session = await auth0.getSession(correctedRequest);
  console.log('[getSessionWithProxy] Result:', { hasSession: !!session });
  return session;
}
