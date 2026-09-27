# Structure & Placement

Where a file goes, and what its module root is allowed to contain. Read this before adding a
module, a feature, or a helper.

Moved out of `CONVENTIONS.md`; the Golden Rule in that file still governs all of it.

---

## Top-Level Layout

No junk drawers allowed.

We use the **modern Rust module style**: a module named `foo` is declared as `foo.rs` sitting *next* to its `foo/`
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

`shared/logger.rs` is in this tree as the target state and does not exist yet. It is step 1 of
[`logging.md`](logging.md).

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
