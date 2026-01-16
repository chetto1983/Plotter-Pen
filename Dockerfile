# syntax=docker/dockerfile:1

# Stage 1: Build Go server
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS builder
WORKDIR /app

# Install build dependencies for SQLite (CGO required)
RUN apk add --no-cache gcc musl-dev sqlite-dev

# Copy go.mod and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY pkg/ ./pkg/

# Build arguments for cross-compilation
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG TARGETVARIANT

# Build the Go binary
RUN set -eux; \
    GOARM=""; \
    if [ "$TARGETARCH" = "arm" ]; then \
        case "$TARGETVARIANT" in \
            v6) GOARM=6 ;; \
            v7|"") GOARM=7 ;; \
            *) GOARM=7 ;; \
        esac; \
    fi; \
    if [ -n "$GOARM" ]; then export GOARM; fi; \
    CGO_ENABLED=1 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -ldflags="-s -w" -o server cmd/server/main.go

# Stage 2: Final runtime image
FROM --platform=$TARGETPLATFORM alpine:latest AS runner

# Install runtime dependencies
RUN apk add --no-cache sqlite-libs ca-certificates wget

# Environment variables
ENV GIN_MODE=release \
    HOST=0.0.0.0 \
    PORT=8000 \
    DB_PATH=/app/data/plotter.db

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Copy Go binary
COPY --from=builder --chown=appuser:appgroup /app/server ./server
RUN chmod +x ./server

# Copy frontend files
COPY --chown=appuser:appgroup plotter_pen.html ./
COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup styles/ ./styles/

# Copy config files if needed
COPY --chown=appuser:appgroup opcua_config.json ./

USER appuser

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8000/healthz || exit 1

CMD ["./server"]
