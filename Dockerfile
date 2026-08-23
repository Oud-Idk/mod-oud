FROM rust:1.95-slim AS builder
WORKDIR /usr/src/app

ENV SQLX_OFFLINE=true

# Install system dependencies required for building C/C++ dependencies & Opus
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    libssl-dev \
    libopus-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy your source tree
COPY . .

# Build for release
RUN cargo build --release

# Stage 2: Create the runtime image
FROM debian:testing-slim AS runtime
WORKDIR /usr/local/bin

# Install runtime libraries:
# - ca-certificates: HTTPS for Discord API
# - ffmpeg: audio decoding / streaming
# - libopus0: dynamic Opus runtime library
# - libssl3: OpenSSL runtime library
RUN apt-get update && apt-get install -y \
    ca-certificates \
    ffmpeg \
    libopus0 \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
COPY --from=builder /usr/src/app/target/release/mod-oud .

# Run the binary
CMD ["./mod-oud"]