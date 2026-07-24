# Project Conventions

## The Golden Rule: Keep it local, and KISS.

**If it only matters to one feature, it lives inside that feature's folder.**
**If two or more features depend on it, it goes in `shared/`.**

When in doubt, dump it inside the feature. Over-sharing early is exactly what caused our old tangled spaghetti-monster
of a codebase. It is incredibly cheap to promote a file to `shared/` later; it is a psychological nightmare to untangle
it once three different features have already imported it.

---

## General

1. All enums must be `SCREAMING_SNAKE_CASE`, not `camelCase`
    - Always use `#[serde(rename_all = "camelCase")]` for any enums when using serde.
2. All JSONB fields must be `camelCase`, not `snake_case`, for JavaScript conventions.
    - Always use `#[serde(rename_all = "camelCase")]` for any JSONB fields when using serde.
3. All `map_err` for converting errors must be inspected and logged (at least on the debug level).
4. On any type files, place enums then structs.
5. Extract all Redis key getters into its own functions.

---

## 🗺️ Top-Level Layout

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
    └── server.rs         # HTTP Server bootstrap only — routes delegate to features
```

---

## 📦 Feature Folder Shape

Every feature is a `<feature_name>.rs` + `<feature_name>/` pair under `features/`. The `.rs` file is the **public
contract** (see rule below); the folder holds the implementation files. Not every file is required—if your feature
doesn't have web API routes, just omit `web.rs`. Don't overcomplicate it.

```
features/
├── <feature_name>.rs      # THE PUBLIC CONTRACT ONLY — see rule below
└── <feature_name>/
    ├── commands.rs        # Slash command definitions + handler logic
    ├── events.rs          # Event handlers (or events/ dir if you need to split text.rs and voice.rs)
    ├── database.rs        # All SQL/queries for this feature (and only this feature!)
    ├── types.rs           # Structs/enums specific to this feature (including its config struct)
    ├── jobs.rs            # Scheduled/background cron jobs owned by this feature
    ├── keys.rs            # Any Redis key getters 
    ├── placeholders.rs    # Any placeholder replacement logic goes here 
    └── web.rs             # HTTP routes owned by this feature (or web/ dir if several)
```

### `<feature_name>.rs` is a contract, not a junk drawer.

Your feature's `<feature_name>.rs` is a security guard standing at the door. It should **only** contain:

* `mod` declarations for the files inside the sibling `<feature_name>/` folder.
* Clean, flat `pub use` re-exports of the small set of things the rest of the app is actually allowed to call
  (typically: `register_commands()`, `handle_event()`, `routes()`, and the feature's `Config` type).

No external code should ever write `use crate::features::leveling::database::get_xp;`. Instead, they should write
`use crate::features::leveling::get_xp;`. `leveling.rs` must re-export it.

---

## Where does new code go? (The Decision Flow)

When writing new code, run through this mental checklist in order:

1. **Does it belong to exactly one feature?**
    - Put it in that feature's folder, in the file matching its role (`commands.rs`, `config`, `types.rs`, etc.).
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

## 🎛️ Events

`events/dispatch.rs` is the **only** file in the entire project allowed to `match` on the raw Serenity/Poise event enum.
It should read like a clean table of contents:

```rs
match event {
Event::Message(msg) => {
features::message_filter::handle_event( & msg, ctx).await;
features::message_logging::handle_event(& msg, ctx).await;
features::leveling::handle_event( & msg, ctx).await;
}
Event::VoiceStateUpdate(old, new) => {
features::leveling::handle_voice_event( & old, &new, ctx).await;
features::temp_voice::handle_event( & old, & new, ctx).await;
}
// ...
}
```

If `dispatch.rs` needs an `if` statement to decide business logic (e.g., *"only log if the channel isn't excluded"*),
that logic is misplaced—it belongs inside the feature's own `check_for_filter`, not in the global dispatcher.

---

## Jobs

A background job lives in the feature it serves (`features/tickets/jobs.rs`, `features/leveling/jobs.rs`).

Only genuinely generic scheduling infrastructure (the cron runner itself, not any specific job) stays outside
`features/`. If a job touches two features' data, that's a sign that one feature owns the job and must call the other
feature's public `<feature_name>.rs` API. Jobs do not get a free pass to break feature isolation.

---

## Naming Conventions

* **File names describe roles, not contents:** `commands.rs`, `config`, `types.rs`, `dispatch`, `jobs.rs`,
  `web.rs`. Two different features' `config` files should look virtually identical in layout, even if the SQL queries
  inside are completely different.
* **Stop creating `utils.rs` as a default dumping ground.** If you are about to add one, ask yourself: *"A utility for
  what?"* Usually, the answer reveals it belongs in an existing file (`config`, `types.rs`) or needs a specific,
  nameable helper file (e.g., `calculation.rs`).
* **Never use `mod.rs`.** Every module is `name.rs` sitting beside its `name/` folder. This applies at every level of
  the tree, not just `features/`.

---

## Adding a Brand-New Feature (The Quick Checklist)

1. Create `features/<name>.rs` with empty `pub` stubs for the surface you expect to need (`register_commands`,
   `check_for_filter`, `routes`), and a sibling `features/<name>/` folder for its guts.
2. Add `mod <name>;` to `features.rs`.
3. Wire it in exactly the places `<name>.rs` demands: `main.rs` (register commands), `events/dispatch.rs` (if it listens
   to events), `web/server.rs` (if it has web routes).
4. Everything else stays inside the feature folder. No new top-level directories, and absolutely no new `shared/`
   entries unless step 3 of the Decision Flow is met.

---

## What NOT to do (The Code Smells)

* **❌ `mod.rs` files:** Any file named `mod.rs` anywhere in the tree. Use `name.rs` + `name/` instead — it's the modern,
  unambiguous style and plays nicer with editor tabs.
* **❌ Layer-First Folders:** Creating folders like `commands/`, `events/handlers/`, or `jobs/` containing one file per
  feature. This is what caused the "5-folders-to-add-one-feature" nightmare.
* **❌ Reaching into Guts:** Calling another feature's `config` or `types_internal.rs` directly. Call its
  `<feature_name>.rs` API, even if it requires a little more typing today.
* **❌ Fake Shared Helpers:** Creating a `misc.rs` or `helpers.rs` at the root of `features/`. That's just `shared/`
  wearing a cheap mustache. Put it in `shared/` for real, or admit it belongs inside a specific feature.