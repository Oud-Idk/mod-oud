# mod-oud

A self-hostable Discord moderation bot with an accompanying web dashboard. The bot is written in
**Rust** ([Serenity](https://github.com/serenity-rs/serenity) +
[Poise](https://github.com/serenity-rs/poise)) and serves its own HTTP API via
[Axum](https://github.com/tokio-rs/axum). The dashboard is a
[Next.js](https://nextjs.org) app that talks to the bot's API and the database directly.

## Architecture

- One Rust binary that can run the gateway bot, the web server, or both, controlled by `RUN_BOT` /
  `RUN_WEB` env flags.
- Horizontally shardable (`SHARD_INDEX` / `TOTAL_SHARDS`): each shard runs as its own container
  sharing Postgres and Redis state.
- Background/cron jobs use distributed Redis locks so multiple instances never double-execute.
- Production traffic is served behind
  a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/),
  which means no inbound ports on the host.
- Backend of frontend (Next.js Server Actions) can interact with Redis for invalidation and Postgres
  for storing config

## Features

Moderation & safety: automod, bad-word rulesets, raid detection, warnings, moderation actions,
media-only channels, verification (Turnstile/hCaptcha), reporting, message logging, invite tracking.

Community: leveling (+ rewards/multipliers), starboard, giveaways, birthdays, reaction roles, custom
commands, reminders, member counters, join/leave messages, temp voice hubs, tickets, live feed,
search integrations (Spotify, YouTube, Genius, GIPHY, TMDB, RAWG), and music playback (Songbird).

Each feature lives in its own vertical slice under `src/features/`. see
[CONVENTIONS.md](./CONVENTIONS.md).

## Development

### Prerequisites

- Rust 1.85+ (edition 2024)
- Node.js 20+
- Docker (for Postgres + Redis)

### Setup

1. Copy the env template and fill it in:

   ```bash
   cp .env.example .env
   ```
   At minimum, you need `DISCORD_TOKEN`, `DATABASE_URL`, `REDIS_URL`,
   `POSTGRES_PASSWORD`, and `REDIS_PASSWORD`.

2. Start the local databases:

   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

3. Run the bot (migrations run automatically on startup; SQLx uses offline query metadata from
   `.sqlx/`, so no live DB is needed to compile):

   ```bash
   cargo run
   ```

4. In another terminal, run the dashboard:

   ```bash
   cd dashboard
   npm install
   npm run dev
   ```

   Open http://localhost:3000. The dashboard expects the bot's API at the URL set in
   `NEXT_PUBLIC_BACKEND_URL`.

### Useful commands

| Command                          | What it does                              |
|----------------------------------|-------------------------------------------|
| `cargo build --release`          | Build the bot                             |
| `cargo clippy`                   | Lint (pedantic/nursery lints are enabled) |
| `cargo fmt`                      | Format (config in `rustfmt.toml`)         |
| `npm run lint` (in `dashboard/`) | Lint the dashboard                        |
| `npm test` (in `dashboard/`)     | Run Vitest tests                          |

## Production

The full stack lives in `docker-compose.prod.yml`: two bot shards, a web/API-only container, the
dashboard, Postgres, Redis, and a cloudflared tunnel. One-time setup steps are documented in
comments at the top of that file; then deploy with:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

For running many guilds across multiple hosts, see `docker-compose.multi.yml`.

## Environment variables

See [.env.example](./.env.example) for the full list. Highlights:

| Variable                                 | Purpose                                                 |
|------------------------------------------|---------------------------------------------------------|
| `DATABASE_URL` / `REDIS_URL`             | Postgres and Redis connections                          |
| `DISCORD_TOKEN`                          | Bot token                                               |
| `RUN_BOT` / `RUN_WEB` / `RUN_MIGRATIONS` | Toggle which parts of the binary run                    |
| `SHARD_INDEX` / `TOTAL_SHARDS`           | Gateway sharding                                        |
| `DOMAIN` / `NEXT_PUBLIC_BACKEND_URL`     | Public URLs for links and API calls                     |
| Third-party keys                         | Spotify, Google Cloud, Genius, GIPHY, Klipy, TMDB, RAWG |
| Captcha secrets                          | Turnstile / HCaptcha for the verification feature       |

## Contributing

Before writing code, read [CONVENTIONS.md](./CONVENTIONS.md) (Rust bot) and
[dashboard/CONVENTIONS.md](./dashboard/CONVENTIONS.md) (frontend). The short version: keep code
inside the feature it belongs to, share only when 3+ features need it, never use `mod.rs`, and use
compile-checked SQLx macros.
