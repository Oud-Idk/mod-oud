# mod-oud

Discord moderation bot (Rust/Serenity) with a Next.js dashboard. Conventions live in
`CONVENTIONS.md` (Rust bot) and `dashboard/CONVENTIONS.md` (frontend). The longer Rust
conventions are split out into `docs/`: `logging.md`, `structure.md`, `database.md`.

## Writing Comments and Docs

Keep them short. A comment exists to say something the code cannot, not to narrate the code.

- **No em-dashes.** Not in comments, not in docs, not in log messages, not in user-facing strings.
  Use a comma, a colon, a full stop, or two sentences.
- **No narrative.** Do not describe the history of a line ("this used to return the wrong thing",
  "previously the error was swallowed"), and do not walk through what the next few lines do.
  Comment the present tense, and only where the reason is not obvious from the code.
- **Short.** One or two lines is the default. If a comment needs three or more, the code probably
  wants restructuring instead.
- **Say why, not what.** `// cash is committed here; buy-actions run in a separate transaction`
  earns its place. `// deduct the cash` does not.
- **Do not label comments.** No `Operator note:`, `NB:`, `TODO(author)`, or other prefixes that make
  the reader parse a header before the content.
- **Keep required boilerplate.** `# Errors` sections that `clippy::missing_errors_doc` demands stay
  as they are, even when the body is obvious.

Log messages follow the same rules. Prefer one short sentence. Put the diagnostic detail in fields
(`error`, `guild_id`, `user_id`, `op`, `event`) rather than in prose, so it stays queryable.
