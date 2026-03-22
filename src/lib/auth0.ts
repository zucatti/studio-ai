import { Auth0Client } from "@auth0/nextjs-auth0/server";

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
  // Cookie settings for reverse proxy setup
  session: {
    cookie: {
      domain: '.stevencreeks.com',
      secure: true,
      sameSite: 'lax',
    },
  },
});
