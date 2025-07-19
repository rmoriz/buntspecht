# Multi-stage build for production
FROM oven/bun:1.2-alpine AS builder

# Install additional tools
RUN apk add --no-cache curl iputils jq procps

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json bun.lock* ./

# Install all dependencies (including devDependencies for building)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1.2-alpine AS production

# Install additional tools
RUN apk add --no-cache curl iputils jq procps

# Create app user
RUN addgroup -g 1001 -S bunjs && \
    adduser -S buntspecht -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json bun.lock* ./

# Install only production dependencies
RUN bun install --frozen-lockfile --production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy example config
COPY config.example.toml ./

# Create config directory
RUN mkdir -p /home/buntspecht/.config/buntspecht && \
    chown -R buntspecht:bunjs /home/buntspecht/.config && \
    chown -R buntspecht:bunjs /app

# Switch to non-root user
USER buntspecht

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set default command
CMD ["bun", "run", "dist/index.js"]

# Labels for metadata
LABEL maintainer="your-email@example.com"
LABEL description="Buntspecht - A reliable Fediverse bot for automated messages with flexible sources"
LABEL version="0.12.0"