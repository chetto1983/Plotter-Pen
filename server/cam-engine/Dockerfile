# Multi-stage build for Go CAM Engine
# Stage 1: Build the binary
FROM golang:1.23-alpine AS builder

WORKDIR /build

# Copy go mod files first for layer caching
COPY go.mod go.sum* ./
RUN go mod download

# Copy source files
COPY *.go ./

# Build static binary (no CGO for max portability)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o cam-engine .

# Stage 2: Minimal runtime image
FROM scratch

# Copy the binary
COPY --from=builder /build/cam-engine /cam-engine

# Run the CAM engine
ENTRYPOINT ["/cam-engine"]
