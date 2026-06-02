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

# Build for release
RUN cargo build --release

# Stage 2: Create the runtime image
FROM debian:testing-slim AS runtime
WORKDIR /usr/local/bin

# Install CA certificates (required for HTTPS connections to Discord API)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
# Replace "mod-oud" with the actual binary name defined in your Cargo.toml if different
COPY --from=builder /usr/src/app/target/release/mod-oud .

# Run the binary
CMD ["./mod-oud"]