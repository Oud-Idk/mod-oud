# Project Conventions

**This file only covers the Discord Bot Rust Project**

The short rules that apply everywhere. Anything longer lives in [`docs/`](docs/README.md), linked
from the section it was moved out of.

## The Golden Rule: Keep it local, and KISS.

1. If it only matters to one feature, it lives inside that feature's folder.
2. Code moves to shared/ ONLY when 3 or more features require the core logic. Not just a shared constant or struct.

* It is far better to duplicate a small struct, helper, or SQL query across two features than to couple them together
  tightly. If sharing code introduces an awkward dependency or maintenance burden, duplicate it.
    * **EXCEPTION: AuthN/AuthZ!** Permission checks, role verification, token/JWT validation, and session handling MUST
      ALWAYS be centralized in `shared/` or `core/`. Never duplicate security logic across features—inconsistency breeds
      security vulnerabilities.
* When in doubt, dump it inside the feature. Over-sharing early is exactly what caused our old tangled spaghetti-monster
  of a codebase. It is incredibly cheap to promote a file to `shared/` later; it is a psychological nightmare to
  untangle it once three different features have already imported it.

## Naming

1. All Postgres/SQL enums must use `SCREAMING_SNAKE_CASE`, never `snake_case`.
    - In Rust structs mapping to DB enums, use `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]` (or
      `#[sqlx(rename_all = "SCREAMING_SNAKE_CASE")]`).
2. All JSONB fields must be `camelCase`, not `snake_case`, for JavaScript conventions.
    - Always use `#[serde(rename_all = "camelCase")]` for any JSONB fields when using serde.

## File Structure

1. On any type files, place enums then structs.
2. Always wrap Redis key generation in getter functions. Never hardcode string keys inside cache logic.
    - If a feature has **3 or more** distinct key getters, put them in a dedicated `keys.rs` file.
    - If it has **fewer than 3**, keep the getter functions directly inside `cache.rs`.
3. If two features need each other (circular dependency), that's a signal one of them should be split, or the shared
   piece should move to `shared/`.

Where a new file belongs, and what a module root may contain: [`docs/structure.md`](docs/structure.md).

## Discord Commands

1. If a command touches the database, external HTTP APIs, or Redis, defer immediately.

## Error Handling

1. Internal Errors must be logged via `tracing::error!` and returned to the user as a generic friendly message (e.g.,
   "Something went wrong on our end").
2. Log the failure once. An error that is propagated is logged by the boundary that receives it, not on the way up.
   See [`docs/logging.md`](docs/logging.md).

## Background Jobs (`jobs.rs`)

1. **Redis Locking for Crons:** Every scheduled job MUST acquire a distributed Redis lock before executing to prevent
   duplicate execution when multiple bot instances are running. Use the provided lock at
   `shared/locking.rs`
2. **Graceful Task Spawning:** Spawn background tasks through `shared::task::spawn`, which attaches the span and logs
   the task's outcome. An `#[instrument]` attribute on an `async move` block inside `tokio::spawn` does nothing. See
   [`docs/logging.md`](docs/logging.md).

## State & Database

1. Never hold DB transactions across `await` points unless strictly necessary.

The `Raw DTO` pattern and the snowflake casting rules: [`docs/database.md`](docs/database.md).

## Others

1. Never use heavy CPU-bound tasks (e.g., image manipulation, heavy cryptography, massive JSON parsing) directly on
   async worker threads. Offload them using `tokio::task::spawn_blocking`.

## Logging

Where a log line goes, what level it is, and what shape it takes: [`docs/logging.md`](docs/logging.md).

## Tests

*They don't exist... yet.*

1. **Unit Tests live inside the file being tested.** Place them at the bottom of the source file inside an inlined
   `#[cfg(test)] mod tests { ... }`.
    - *Cluttered?* Use that handy code-collapse feature in your IDE. If your IDE doesn't have one, reconsider your life
      choices.
2. **Integration Tests (Cross-feature / Live DB tests)** live in the top-level `tests/` directory outside `src/`,
   following standard Cargo conventions.
3. **Test Helpers & Mocks:** Mock factories or test fixtures used by multiple features live in `shared/` wrapped under
   `#[cfg(test)]` so they never compile into production binaries.
4. **Test Business Logic, Not Discord Wrappers:** Prioritize testing core domain logic, calculations, and state
   rules—not the slash command functions directly. Keep command handlers thin (extract business logic into helper
   functions) so it can be tested without needing to mock Serenity or Discord contexts.
