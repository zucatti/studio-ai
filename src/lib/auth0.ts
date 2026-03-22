import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const baseUrl = process.env.AUTH0_BASE_URL || 'https://studio.stevencreeks.com';

const auth0Client = new Auth0Client({
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
 * Helper to build a corrected request with proper URL for reverse proxy.
 */
async function buildCorrectedRequest(): Promise<NextRequest> {
  const cookieStore = await cookies();

  // Filter out empty cookies and old __session format
  const validCookies = cookieStore.getAll().filter(c => {
    if (!c.value || c.value === '') return false;
    if (c.name === '__session') return false;
    return true;
  });

  const cookieHeader = validCookies
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  return new NextRequest(new URL('/', baseUrl), {
    headers: new Headers({
      'cookie': cookieHeader,
    }),
  });
}

/**
 * Wrapped Auth0 client that fixes getSession for reverse proxy setup.
 */
export const auth0 = {
  ...auth0Client,

  // Override getSession to use corrected request
  async getSession(req?: NextRequest) {
    if (req) {
      return auth0Client.getSession(req);
    }
    const correctedRequest = await buildCorrectedRequest();
    return auth0Client.getSession(correctedRequest);
  },

  // Keep middleware using the original client
  middleware: auth0Client.middleware.bind(auth0Client),
};
