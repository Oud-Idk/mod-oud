# Project Conventions

## The Golden Rule: Keep it local, and KISS.

**If it only matters to one feature, it lives inside that feature's folder.**
**If two or more features depend on it, it goes in `shared/`.**

When in doubt, dump it inside the feature. Over-sharing early is exactly what caused our old tangled spaghetti-monster
of a codebase. It is incredibly cheap to promote a file to `shared/` later; it is a psychological nightmare to untangle
it once three different features have already imported it.

---

## Naming Conventions

To prevent the chaotic key mismatches that cost us our sanity, we follow two non-negotiable casing laws:

### 1. ALL ENUMS MUST BE `SCREAMING_SNAKE_CASE` 🗣️

Every single enum mapped to the database (SQLx) or sent over the network (Serde) **must** derive
`rename_all = "SCREAMING_SNAKE_CASE"`.

* **Why?** A single-word variant like `Mild` works fine with `"UPPERCASE"`, but the second you add `VerySevere`,
  `"UPPERCASE"` smashes it into `"VERYSEVERE"` like a caveman. `"SCREAMING_SNAKE_CASE"` gives you the beautiful,
  database-friendly `"VERY_SEVERE"`. Future-proof your enums!

### 2. ALL JSONB FIELDS MUST BE `camelCase` 🐫

Any struct that gets serialized into a Postgres `jsonb` column (or parsed from one) **must** use
`#[serde(rename_all = "camelCase")]`.

* **Why?** When the Next.js frontend, Node, or dashboard tools query and parse that JSON blob, JavaScript natively
  expects `camelCase`. Storing raw `snake_case` inside JSONB is a trap that leads to floating-point rounding or manual
  key-translation nightmares.

### 3. Before using `map_err` for any web errors, `inspect_err` and log first!

### 4. Enums before structs!

---

## 🗺️ Top-Level Layout

Our codebase reads like a well-organized book. No junk drawers allowed.

We use the **modern Rust module style**: a module named `foo` is declared as `foo.rs` sitting *next to* its `foo/`
folder — never `foo/mod.rs`. This means you can see a module's public surface (`foo.rs`) and its guts (`foo/`) as
siblings in the file tree, without needing to open a folder to find the "real" file.

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
    └── web.rs             # HTTP routes owned by this feature (or web/ dir if several)
```

### 🚫 `<feature_name>.rs` is a contract, not a junk drawer.

Your feature's `<feature_name>.rs` is a security guard standing at the door. It should **only** contain:

* `mod` declarations for the files inside the sibling `<feature_name>/` folder.
* Clean, flat `pub use` re-exports of the small set of things the rest of the app is actually allowed to call (
  typically: `register_commands()`, `handle_event()`, `routes()`, and the feature's `Config` type).

No external code should ever write:
`use crate::features::leveling::database::get_xp;` ❌ *(Straight to jail)*

Instead, they should write:
`use crate::features::leveling::get_xp;` — `leveling.rs` must re-export it. **If you have to reach past a feature's
`<feature_name>.rs` to grab its guts, that is your signal that the function needs to be re-exported (or shouldn't be
called from the outside at all).**

---

## 🚦 Where does new code go? (The Decision Flow)

When writing new code, run through this mental checklist in order:

1. **Does it belong to exactly one feature?**
   👉 Put it in that feature's folder, in the file matching its role (`commands.rs`, `database.rs`, `types.rs`, etc.).
2. **Is it glue that wires features into the bot/web framework itself?**
   👉 Put it in `core/` or `events/dispatch.rs`.
3. **Is it used by 3+ features and has absolutely zero feature-specific knowledge?**
   👉 Put it in `shared/` (e.g., a generic placeholder engine, generic embed builder, global error types).
4. **Still unsure?**
   👉 **Put it in the feature.** You can move it to `shared/` in a single, painless RustRover refactor later. Untangling
   a prematurely shared file is ten times more expensive.

### 📐 The Naming Rule for Splitting Files

When `events.rs` or `database.rs` gets too massive, split by **sub-behavior**, not by technical layers — using the
same `name.rs` + `name/` sibling pattern one level deeper.

* **Good:** `features/leveling/events.rs` (`mod text; mod voice;`) with `features/leveling/events/text.rs` and
  `.../events/voice.rs`
* **Bad:** `.../text/handler.rs` + `.../text/notify.rs` + `.../text.rs` (3 levels of folder nesting is too deep. If
  you need a 3rd level, the feature is actually two separate features!).

---

## 🎛️ Events

`events/dispatch.rs` is the **only** file in the entire project allowed to `match` on the raw Serenity/Poise event enum.
It should read like a clean table of contents:

```rust
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
that logic is misplaced—it belongs inside the feature's own `handle_event`, not in the global dispatcher.

---

## ⏰ Jobs

A background job lives in the feature it serves (`features/tickets/jobs.rs`, `features/leveling/jobs.rs`).

Only genuinely generic scheduling infrastructure (the cron runner itself, not any specific job) stays outside
`features/`. If a job touches two features' data, that's a sign that one feature owns the job and must call the other
feature's public `<feature_name>.rs` API. Jobs do not get a free pass to break feature isolation.

---

## 📛 Naming Conventions

* **File names describe roles, not contents:** `commands.rs`, `database.rs`, `types.rs`, `events.rs`, `jobs.rs`,
  `web.rs`. Two different features' `database.rs` files should look virtually identical in layout, even if the SQL
  queries inside are completely different.
* **Stop creating `utils.rs` as a default dumping ground.** If you are about to add one, ask yourself: *"A utility for
  what?"* Usually, the answer reveals it belongs in an existing file (`database.rs`, `types.rs`) or needs a specific,
  nameable helper file (e.g., `calculation.rs`).
* **Never use `mod.rs`.** Every module is `name.rs` sitting beside its `name/` folder. This applies at every level of
  the tree, not just `features/`.

---

## 🛠️ Adding a Brand-New Feature (The Quick Checklist)

1. Create `features/<name>.rs` with empty `pub` stubs for the surface you expect to need (`register_commands`,
   `handle_event`, `routes`), and a sibling `features/<name>/` folder for its guts.
2. Add `mod <name>;` to `features.rs`.
3. Wire it in exactly the places `<name>.rs` demands: `main.rs` (register commands), `events/dispatch.rs` (if it
   listens to events), `web/server.rs` (if it has web routes).
4. Everything else stays inside the feature folder. No new top-level directories, and absolutely no new `shared/`
   entries unless step 3 of the Decision Flow is met.

---

## ❌ What NOT to do (The Code Smells)

* **❌ `mod.rs` files:** Any file named `mod.rs` anywhere in the tree. Use `name.rs` + `name/` instead — it's the
  modern, unambiguous style and plays nicer with editor tabs.
* **❌ Layer-First Folders:** Creating folders like `commands/`, `events/handlers/`, or `jobs/` containing one file per
  feature. This is what caused the "5-folders-to-add-one-feature" nightmare.
* **❌ Reaching into Guts:** Calling another feature's `database.rs` or `types_internal.rs` directly. Call its
  `<feature_name>.rs` API, even if it requires a little more typing today.
* **❌ Fake Shared Helpers:** Creating a `misc.rs` or `helpers.rs` at the root of `features/`. That's just `shared/`
  wearing a cheap mustache. Put it in `shared/` for real, or admit it belongs inside a specific feature.