# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects anonymous telemetry - disable it
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time env vars (placeholders - real values injected at runtime)
# Supabase
ENV NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
ENV SUPABASE_SERVICE_ROLE_KEY=placeholder
# Auth0
ENV AUTH0_SECRET=placeholder-secret-at-least-32-chars-long
ENV AUTH0_BASE_URL=https://placeholder.com
ENV AUTH0_ISSUER_BASE_URL=https://placeholder.auth0.com
ENV AUTH0_CLIENT_ID=placeholder
ENV AUTH0_CLIENT_SECRET=placeholder
# App
ENV NEXT_PUBLIC_APP_URL=https://placeholder.com
# Storage
ENV S3_ENDPOINT=https://placeholder.com
ENV S3_BUCKET=placeholder
ENV S3_KEY=placeholder
ENV S3_SECRET=placeholder
# AI (optional but may be checked)
ENV AI_FAL_KEY=placeholder
ENV AI_WAVESPEED=placeholder
ENV AI_ELEVEN_LABS=placeholder
ENV AI_ANTHROPIC=placeholder

# Build with standalone output
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
