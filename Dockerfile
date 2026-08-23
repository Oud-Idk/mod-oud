# syntax=docker/dockerfile:1
FROM rust:1.98-slim AS builder
WORKDIR /usr/src/app

ENV SQLX_OFFLINE=true

# Install C/C++ build tools, cmake, OpenSSL, and Opus dev headers
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libopus-dev \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Build for release with BuildKit cache mounts
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/src/app/target \
    cargo build --release \
    && cp target/release/mod-oud /usr/local/bin/mod-oud

# Stage 2: Create the runtime image
FROM debian:bookworm-slim AS runtime
WORKDIR /usr/local/bin

# Install runtime dependencies (ffmpeg, opus audio, ca-certs for Discord websocket)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    ffmpeg \
    libopus0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/mod-oud .

CMD ["./mod-oud"]