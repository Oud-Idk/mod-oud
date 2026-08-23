# mod-oud

Discord moderation bot (Rust/Serenity) with a Next.js dashboard. Conventions live in
`CONVENTIONS.md` (Rust bot) and `dashboard/CONVENTIONS.md` (frontend).

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` — no remote tracker. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
