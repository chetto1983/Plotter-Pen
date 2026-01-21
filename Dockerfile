# syntax=docker/dockerfile:1

# Plotter-Pen Docker Build
# Go backend with JavaScript frontend for pen plotter CAD with OPC UA integration

# Stage 1: Install Node.js dependencies (for Three.js Line2 modules)
FROM node:22-alpine AS node-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production || npm install --production

# Stage 2: Build Go server
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS builder
WORKDIR /app

# Install build dependencies for SQLite (CGO required)
RUN apk add --no-cache gcc musl-dev sqlite-dev

# Copy go.mod and download dependencies
COPY go.mod go.sum ./
ENV GOTOOLCHAIN=auto
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
FROM alpine:latest AS runner

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

# Create directories
RUN mkdir -p /app/data /app/certs && chown -R appuser:appgroup /app/data /app/certs

# Copy Go binary
COPY --from=builder --chown=appuser:appgroup /app/server ./server
RUN chmod +x ./server

# Copy frontend files
COPY --chown=appuser:appgroup plotter_pen.html ./
COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup assets/ ./assets/
COPY --chown=appuser:appgroup favicon.ico ./

# Copy node_modules (Three.js Line2 modules for thick line rendering)
COPY --from=node-deps --chown=appuser:appgroup /app/node_modules/ ./node_modules/

# Copy config files (optional, can be overridden by volume)
COPY --chown=appuser:appgroup opcua_config.json ./

USER appuser

EXPOSE 8000

# Health check using Go server's health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8000/healthz || exit 1

CMD ["./server"]
