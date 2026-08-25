# syntax=docker/dockerfile:1
FROM rust:1.98-slim AS chef
WORKDIR /usr/src/app

RUN cargo install cargo-chef --locked

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder

ENV SQLX_OFFLINE=true

# Install C/C++ build tools, cmake, OpenSSL, and Opus dev headers
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libopus-dev \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

COPY --from=planner /usr/src/app/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo chef cook --release --recipe-path recipe.json

COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release \
    && cp target/release/mod-oud /usr/local/bin/mod-oud

FROM debian:trixie-slim AS runtime
WORKDIR /usr/local/bin

RUN apt-get update && apt-get install -y \
    ca-certificates \
    ffmpeg \
    libopus0 \
    python3 \
    curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/mod-oud .

CMD ["./mod-oud"]