# syntax=docker/dockerfile:1
# ML inference service. The bot talks to it over gRPC; see crates/ml-inference.
FROM rust:1.98-slim AS chef
WORKDIR /usr/src/app

RUN cargo install cargo-chef --locked

FROM chef AS planner
COPY . .
# `--bin` prunes the bot and its deps, so this image only cooks the model runtime.
RUN cargo chef prepare --bin ml-inference --recipe-path recipe.json

FROM chef AS builder

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

COPY --from=planner /usr/src/app/recipe.json recipe.json
RUN cargo chef cook --release --package ml-inference --recipe-path recipe.json

COPY . .
RUN cargo build --release -p ml-inference \
    && cp target/release/ml-inference /usr/local/bin/ml-inference

FROM debian:trixie-slim AS runtime
WORKDIR /usr/local/bin

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/ml-inference .

CMD ["./ml-inference"]