# Project Conventions

**This file only covers the Discord Bot Rust Project**

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
3. Log inside `inspect_err` only if the error is swallowed or transformed into a generic error where original context
   would otherwise be lost.

## File Structure

1. On any type files, place enums then structs.
2. Always wrap Redis key generation in getter functions. Never hardcode string keys inside cache logic.
    - If a feature has **3 or more** distinct key getters, put them in a dedicated `keys.rs` file.
    - If it has **fewer than 3**, keep the getter functions directly inside `cache.rs`.
3. If two features need each other (circular dependency), that's a signal one of them should be split, or the shared
   piece should move to `shared/`.

## Discord Commands

1. If a command touches the database, external HTTP APIs, or Redis, defer immediately.

## Error Handling

1. Internal Errors must be logged via `tracing::error!` and returned to the user as a generic friendly message (e.g.,
   "Something went wrong on our end").

## Background Jobs (`jobs.rs`)

1. **Redis Locking for Crons:** Every scheduled job MUST acquire a distributed Redis lock before executing to prevent
   duplicate execution when multiple bot instances are running. Use the provided lock at
   `shared/locking.rs`
2. **Graceful Task Spawning:** Always spawn background tasks using `tokio::spawn` with a `tracing::instrument` macro so
   panics in background tasks are caught and logged with span context rather than crashing silently.

## State & Database

1. Never hold DB transactions across `await` points unless strictly necessary. Keep transactions as short as humanly
   possible to avoid pool starvation.

## Others

1. Never use heavy CPU-bound tasks (e.g., image manipulation, heavy cryptography, massive JSON parsing) directly on
   async worker threads. Offload them using `tokio::task::spawn_blocking`.

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

---

## Top-Level Layout

No junk drawers allowed.

We use the **modern Rust module style**: a module named `foo` is declared as `foo.rs` sitting *next to* its `foo/`
folder. never `foo/mod.rs`.

```
src/
├── main.rs               # Wiring only: build Config, register features, start bot + web
├── core.rs               # `mod config; mod setup;` — re-exports only
├── core/                 # Framework/bootstrapping glue — NOT feature logic
│   ├── config.rs         # The AppState/Config struct, DB pool setup
│   └── setup.rs
├── events.rs             # `mod dispatch;`
├── events/
│   └── dispatch.rs       # Fan-out: raw serenity event -> feature::handle_event()
├── shared.rs             # `mod error; mod locking; mod logger; mod placeholders; mod embed;`
├── shared/               # Cross-cutting utilities used by 3+ features
│   ├── error.rs
│   ├── locking.rs
│   ├── logger.rs
│   ├── placeholders.rs
│   └── embed.rs
├── features.rs           # `mod <feature_name>;` for every feature
├── features/
│   └── <feature_name>.rs # Everything about one specific feature — see below!
│   └── <feature_name>/   # The feature's supporting files
├── web.rs                # `mod server;`
└── web/
    ├── routes.rs         # Collect all routes from features
    └── server.rs         # Startup, CORS, listener, and shared states
```

---

## Feature Folder Shape

Every feature is a `<feature_name>.rs` + `<feature_name>/` pair under `features/`. The `.rs` file is the **public
contract** (see rule below); the folder holds the implementation files. Not every file is required—if your feature
doesn't have web API routes, just omit `web.rs`. Don't overcomplicate it.

```
features/
├── <feature_name>.rs      # THE PUBLIC CONTRACT ONLY — see rule below
└── <feature_name>/
    ├── commands.rs        # Slash command definitions + handler logic
    ├── cache.rs           # Anything redis related
    ├── events.rs          # Event handlers (or events/ dir if you need to split text.rs and voice.rs)
    ├── database.rs        # All SQL/queries for this feature (and only this feature!)
    ├── types.rs           # Structs/enums specific to this feature (including its config struct). Exclude req/res types.
    ├── jobs.rs            # Scheduled/background cron jobs
    ├── keys.rs            # Any Redis key getters 
    ├── placeholders.rs    # Any placeholder replacement logic goes here 
    └── web.rs             # HTTP routes (or web/ dir if several). 
```

You have to create a `web/` directory in a feature when you have 3+ endpoints OR file exceeds ~300 lines of code
(endpoints include different methods). Otherwise, place it at `web.rs`. Request and response structs should be placed at
the top. If you have decided to make a directory, combine all routes into one Router in the feature's `web.rs` file.

Note that this isn't a strict guidelines and that you may add more files if needed. For example, src/features/leveling
includes calculation.rs.

### `<feature_name>.rs` is a contract, not a junk drawer.

Your feature's `<feature_name>.rs` is a security guard standing at the door. It should **only** contain:

* `mod` declarations for the files inside the sibling `<feature_name>/` folder.
* Clean, flat `pub use` re-exports of the small set of things the rest of the app is actually allowed to call
  (typically: `register_commands()`, `handle_event()`, `routes()`, and the feature's `Config` type).

No external code should ever write `use crate::features::leveling::database::get_xp;`. Instead, they should write
`use crate::features::leveling::get_xp;`. `leveling.rs` must re-export it.

To enforce this rule, do not put `pub mod` declarations in the feature's `<feature_name>.rs` file.

**DO NOT USE WILDCARDS IN `pub use` STATEMENTS. THAT DEFEATS THE ENTIRE PURPOSE OF THIS**

---

## Where does new code go? (The Decision Flow)

When writing new code, run through this mental checklist in order:

1. **Does it belong to exactly one feature?**
    - Put it in that feature's folder, in the file matching its role (`custom_command`, `config`, `types.rs`, etc.).
2. **Is it glue that wires features into the bot/web framework itself?**
    - Put it in `core/` or `events/dispatch.rs`.
3. **Is it used by 3+ features and has absolutely zero feature-specific knowledge?**
    - Put it in `shared/` (e.g., a generic placeholder engine, generic embed builder, global error types).
4. **Still unsure?**
    - **Put it in the feature.** You can move it to `shared/` in a single, painless RustRover refactor later. Untangling
      a prematurely shared file is ten times more expensive.

### The Naming Rule for Splitting Files

When `dispatch` or `config` gets too massive, split by **sub-behavior**, not by technical layers — using the same
`name.rs` + `name/` sibling pattern one level deeper.

* **Good:** `features/leveling/events.rs` (`mod text; mod voice;`) with `features/leveling/events/text.rs` and
  `.../events/voice.rs`
* **Bad:** `.../text/handler.rs` + `.../text/notify.rs` + `.../text.rs` (3 levels of folder nesting is too deep. If you
  need a 3rd level, the feature is actually two separate features!).

---

## Events

`events/dispatch.rs` is the **only** file in the entire project allowed to `match` on the raw Serenity/Poise event enum.
It should read like a clean table of contents.

If `dispatch.rs` needs an `if` statement to decide business logic (e.g., *"only log if the channel isn't excluded"*),
that logic is misplaced—it belongs inside the feature's own `check_for_filter`, not in the global dispatcher.

---

## Naming Conventions

* **File names describe roles, not contents:** `custom_command`, `config`, `types.rs`, `dispatch`, `jobs.rs`,
  `web.rs`. Two different features' `config` files should look virtually identical in layout, even if the SQL queries
  inside are completely different.
* **Stop creating `utils.rs` as a default dumping ground.** If you are about to add one, ask yourself: *"A utility for
  what?"* Usually, the answer reveals it belongs in an existing file (`config`, `types.rs`) or needs a specific,
  nameable helper file (e.g., `calculation.rs`).
* **Never use `mod.rs`.** Every module is `name.rs` sitting beside its `name/` folder. This applies at every level of
  the tree, not just `features/`.

---

## What NOT to do (The Code Smells)

* **`mod.rs` files:** Any file named `mod.rs` anywhere in the tree. Use `name.rs` + `name/` instead — it's the modern,
  unambiguous style and plays nicer with editor tabs.
* **Layer-First Folders:** Creating folders like `commands/`, `events/handlers/`, or `jobs/` containing one file per
  feature. This is what caused the "5-folders-to-add-one-feature" nightmare.
* **Reaching into Guts**: Calling another feature's internal submodules directly. Always call exported functions from
  its root file (e.g., crate::features::foo::bar).
* **Bullshit File Names:** No file named `utils.rs` or `misc.rs`.
* **No SQLx methods that is checked at runtime. Use the macros, lazy ass.**

All guild_id args should be u64, then convert to i64 at the SQLx statement using `.cast_signed()`.
And the other way around (SQLx guild ID comes out as i64), use `.cast_unsigned()`.
