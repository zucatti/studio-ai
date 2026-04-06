# Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (gl, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    python-is-python3 \
    build-essential \
    pkg-config \
    libxi-dev \
    libglu1-mesa-dev \
    libglew-dev \
    libgl1-mesa-dev \
    libegl1-mesa-dev \
    libgles2-mesa-dev \
    xorg-dev \
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
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libegl1-mesa \
    libgles2-mesa \
    xvfb \
    xauth \
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
# Note: xvfb-run waits for USR1 signal that some Xvfb versions don't send
# Using manual Xvfb start instead
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp & sleep 1 && DISPLAY=:99 exec node dist/index.js"]
