# ==========================================
# Stage 1: Download & extract language server
# ==========================================
FROM debian:bookworm-slim AS extractor

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/extract
# Download official Google Antigravity Linux build
RUN curl -fsSL "https://edgedl.me.gvt1.com/edgedl/release2/j0qc3/antigravity/stable/2.5.5-4923483625488384/linux-x64/Antigravity%20IDE.tar.gz" -o antigravity.tar.gz \
    && tar -xzf antigravity.tar.gz \
    && mkdir -p /app/bin \
    && find . -type f -name "language_server_linux_x64" -exec cp {} /app/bin/language_server_linux_x64 \; \
    && chmod +x /app/bin/language_server_linux_x64 \
    && rm -rf /tmp/extract

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-bookworm-slim

# Install procps (for ps/pkill) and curl (for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from extractor
COPY --from=extractor /app/bin/language_server_linux_x64 /app/bin/language_server_linux_x64

# Copy dependencies & install
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY src/ ./src/
COPY public/ ./public/

# Environment configuration
ENV NODE_ENV=production
ENV PORT=8045
ENV LANGUAGE_SERVER_BINARY=/app/bin/language_server_linux_x64

# Create volume mount point for persistent configuration & tokens
RUN mkdir -p /root/.gemini
VOLUME ["/root/.gemini"]

EXPOSE 8045

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8045/api/status || exit 1

CMD ["node", "src/server.js"]
