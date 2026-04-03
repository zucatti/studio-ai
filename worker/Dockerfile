# Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (gl, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    libxi-dev \
    libglu1-mesa-dev \
    libglew-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for building)
RUN npm install

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies for production
RUN npm prune --omit=dev

# Production stage
FROM node:20-bookworm-slim

# Install runtime dependencies: FFmpeg and OpenGL libraries for headless rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libxi6 \
    libglu1-mesa \
    libglew2.2 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json for reference
COPY package.json ./

# Copy pre-built node_modules from builder (already pruned)
COPY --from=builder /app/node_modules ./node_modules

# Copy built files
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production

# Run the worker with Xvfb for headless OpenGL
CMD ["xvfb-run", "-a", "node", "dist/index.js"]
