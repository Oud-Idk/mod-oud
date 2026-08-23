# syntax=docker/dockerfile:1
FROM rust:1.95-slim AS builder
WORKDIR /usr/src/app

ENV SQLX_OFFLINE=true

# Install system dependencies required for building some Rust crates
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy your source tree
COPY . .

# Build for release. `target/` and the cargo registry live in BuildKit cache
# mounts so CI rebuilds only what changed — the binary is copied out because
# cache-mount contents are not part of the image layer.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/src/app/target \
    cargo build --release \
    && cp target/release/mod-oud /usr/local/bin/mod-oud

# Stage 2: Create the runtime image
FROM debian:testing-slim AS runtime
WORKDIR /usr/local/bin

# Install CA certificates (required for HTTPS connections to Discord API)
# and ffmpeg (required for live stream playback)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
COPY --from=builder /usr/local/bin/mod-oud .

# Run the binary
CMD ["./mod-oud"]
