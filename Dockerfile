# syntax=docker/dockerfile:1

# Stage 1: Build Go CAM engine
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS go-builder
WORKDIR /build
COPY server/cam-engine/go.mod server/cam-engine/go.sum* ./
RUN go mod download
COPY server/cam-engine/*.go ./
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG TARGETVARIANT
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
  CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags="-s -w" -o cam-engine .

# Stage 2: Node.js dependencies
FROM --platform=$TARGETPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 3: Final runtime image
FROM --platform=$TARGETPLATFORM node:22-alpine AS runner
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8000
WORKDIR /app

# Copy Node.js deps
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy Go CAM engine binary
COPY --from=go-builder --chown=node:node /build/cam-engine ./server/cam-engine/cam-engine
RUN chmod +x ./server/cam-engine/cam-engine

# Copy application files
COPY --chown=node:node package*.json ./
COPY --chown=node:node . .

USER node
EXPOSE 8000
CMD ["node", "server.js"]
