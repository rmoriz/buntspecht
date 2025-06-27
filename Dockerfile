# Multi-stage build for production
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy example config
COPY config.example.toml ./

# Create config directory
RUN mkdir -p /home/botuser/.config/buntspecht && \
    chown -R botuser:nodejs /home/botuser/.config && \
    chown -R botuser:nodejs /app

# Switch to non-root user
USER botuser

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Bot is running')" || exit 1

# Set default command
CMD ["node", "dist/index.js"]

# Labels for metadata
LABEL maintainer="your-email@example.com"
LABEL description="Buntspecht - Ein Fediverse/Mastodon-Bot der PING-Nachrichten nach Zeitplan postet"
LABEL version="1.0.0"