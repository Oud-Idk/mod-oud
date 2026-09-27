# Logging & Observability

The log is the only observability this project has: no metrics, no distributed tracing, no error
tracker. That makes it worth a convention, because the questions it has to answer never change.

- Which command failed, for whom, in which guild, on which shard?
- Did the worker keep running after that failure?
- Who took that action, and what did it cost?
- Is the bot still talking to Discord, or has it gone quiet?

Everything below exists to make those four answerable from a log tail.

---

## Two lanes, never mixed

**Diagnostic lines** answer "why did this fail". They inherit context from a span, they are
verbose, they are `debug` or `trace`, and they are cheap to lose.

**Audit lines** answer "who did what". They carry `guild_id`, `user_id` and the action as
explicit fields on every line, they never depend on a span, and they are `info`.

A diagnostic line is only as good as the span that happens to be open, so an audit line has to
stand alone. If you would be upset to lose the line in 30 days, it is an audit line.

Any feature that moves money, bans, or assigns roles gets an `audit.rs` shaped like
`src/features/gambling/audit.rs`: one typed function per event, an `event = "..."` field on
every line, and a comment on each function saying why that function logs at that level.

```rust
// The canonical shape. Every field explicit, nothing inherited.
info!(
    event = "bet_settled",
    game,
    %guild_id,
    %user_id,
    bet,
    outcome,
    payout,
    detail,
    "gambling: bet settled"
);
```

---

## Level means who acts, and how fast

The whole rule: **will someone read this line and do something?** If no, it is not `error!`.

| Level | Means | Examples |
|---|---|---|
| `error!` | A human must fix this now | Data loss, broken invariant, a worker that died or stopped making progress |
| `warn!` | Failed, expected, and happens all the time | Closed DMs, 403, 10008 unknown message, rate limit, missing permission, lock held by another instance, cache miss that fell back |
| `info!` | The operator timeline, and every audit line | Process lifecycle, config invalidation, actions taken |
| `debug!` | Per-event detail, needs an id to be useful | One message's automod verdict, one command's SQL timing |
| `trace!` | Loop internals | Poll iterations, lock attempts |

Choosing by "did I get an `Err`" is the mistake this table exists to prevent. A user with DMs
closed is not a fault in the bot, and logging it at `error!` trains everyone to ignore
`error!`.

Volume test for `info!`: could this fire more than a few hundred times a day on a busy guild?
Then it is `debug!`. Assigning a reaction role is per-button-press, so it is `debug!`.

Anything that can fire per message gets counted, not logged. `automod/spam_tracker.rs` already
holds the counter; log the summary per interval instead of a line per trigger.

---

## Line shape

```rust
// Good.
tracing::warn!(error = %e, %guild_id, %user_id, "moderation dm delivery failed");

// Bad: error in prose, ids in the message, no queryable fields.
tracing::error!("Failed to disconnect member {}: {:?}", target_user_id, err);
```

- The message is a lowercase clause. No trailing period, no "Failed to", no "Error", no
  "Successfully", no `{}` interpolation, no "Starting X" or "Cleanup completed" narration.
- Everything else is a field. The message stays one short sentence.
- Field names are domain names: `guild_id`, `channel_id`, `user_id`, `message_id`, `command`,
  `job`, `event`, `outcome`, `duration_ms`. Never `id`, `e`, `ctx`, `data`, `thing`.
- Never log message content, tokens, or a response body from an authenticated API. A body from
  a keyed endpoint can echo the key back, and `reqwest` errors include the full URL with its
  query string.
- `error = ?e` prints only the outermost context of an `anyhow::Error`. At a boundary, add the
  chain: `error_chain = %format!("{e:#}")`. `core/error.rs` is the reference.

```rust
error!(
    command = %ctx.command().qualified_name,
    guild_id = ?ctx.guild_id(),
    user_id = %ctx.author().id,
    error = ?error,
    error_chain = %format!("{error:#}"),
    "command failed"
);
```

### Every `error!` names a cause

`error!` is reserved for a human having to act, so it always has to say what went wrong. There
is no `Err` in some of the cases worth logging, so the check accepts three fields, and the
distinction between them is the point:

| Field | Use when |
|---|---|
| `error` | You have a value that carries the failure. The normal case. |
| `reason` | The cause is known but is not an error value: an HTTP status, an enum, a sentinel, a `serde` field path. Something failed and you can name why. |
| `fault` | No operation failed. You found an invariant already broken: a missing env var, a malformed cached row, a balance that went negative. The data is already wrong, so there is no `Err` to report. |

**Never construct a fake error to fill `error`.** `io::Error::other("...")` to satisfy a lint puts
a lie in the log and misdirects whoever reads it. If you have no error value, you have `reason`
or `fault`, and picking between them is a small piece of thinking worth doing.

```rust
// A known cause that is not an error value.
error!(
    provider,
    op,
    reason = status.as_u16(),
    url = %safe_url,
    "upstream provider returned a non-success status"
);

// An invariant already broken, so there is nothing to put in `error`.
error!(fault = "VERIFICATION_SECRET is not set", "captcha verification unavailable");
```

Two real sites in this repo are the `fault` case today, and neither is a missing field:

- `gambling/audit.rs` `payout_overflow`: a real win was voided because the payout does not fit
  in `i64`. No operation failed, the numbers were already impossible.
- `core/error.rs` `CommandPanic`: the cause is a panic payload, which is not a
  `std::error::Error`. Log `fault = "command panicked"` alongside `panic = ?payload`.

---

## Log a failure once, where its fate is decided

- **Swallowed** (fallback taken, retry, deliberately ignored): log there, with the fallback
  named as a field.
- **Propagated**: log nowhere. The boundary logs it.

So: log inside `inspect_err` only if the error is swallowed, or transformed into a generic
error where the original context would otherwise be lost.

The boundaries are `core::error::on_error`, the top-level `match` in each worker loop, the axum
error path, and the fallible functions in `main.rs`. Nothing else logs a propagated error.

This is also why `#[instrument(err)]` is banned: it logs the error on the way out, and so does
the boundary, and the two lines share no id. Same for an `#[instrument]` function that also
contains `error!` in its body. Pick one, and for anything returning `Result` the answer is the
boundary.

---

## Spans go at the boundary, not the leaf

Ten spans, opened where work is admitted. Everything downstream inherits them for free.

| Span | Fields |
|---|---|
| `process` (root, in `main`) | `shard_id`, `shard_count`, `log_filter` |
| `dispatch_events` | `event`, `guild_id`, `channel_id`, `user_id` |
| poise command | `command`, `guild_id`, `user_id` |
| each worker | `job` |
| each worker iteration | `duration_ms` |
| each HTTP request | `request_id`, `method`, `path` |

The root span matters more than it looks: it is the only way to tell which shard a line came
from.

Do not instrument leaf helpers. A span on `get_multiplier` is a span that appears 40 times per
message and teaches nobody anything. If a leaf genuinely needs one extra field, use
`#[instrument(fields(...))]` on the function that is already inside a boundary span.

---

## Spawns go through one helper

An `#[instrument]` attribute on an `async move` block inside `tokio::spawn` instruments
nothing. The block is not a function, there is no future to wrap. Attaching span context to a
background task needs `tracing::Instrument`:

```rust
let span = tracing::info_span!("starboard_worker_loop", starboard_id, msg_id = %msg_id);
tokio::spawn(async move { /* ... */ }.instrument(span));
```

`src/features/starboard/events.rs` does this correctly and is one of two valid shapes. The other
is to put the attribute on a named `async fn` and spawn the call, which is what the birthday
worker and the two WebSub workers do, and what `fcbebd2` introduced deliberately. Both work;
what does not work is the attribute on the block.

Those 4 are the only instrumented spawns of 41. The other 37 cannot be tied back to the event
that caused them, which is why a panic in a worker loop currently surfaces with no indication of
which worker died.

Do not hand-roll it 41 times. One helper, in `shared/task.rs`, next to `logger.rs`:

```rust
pub fn spawn<F>(name: &'static str, fut: F) -> JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
```

It opens `info_span!("job", job = name)`, attaches it, and logs exit with outcome and
duration. Then every background task is named, has an outcome, and reports how long it ran.

---

## HTTP requests are visible at the default filter

`TraceLayer::new_for_http()` puts its request span at `DEBUG` and its failure line at `ERROR`.
Under the default filter (`info,sqlx=warn,serenity=warn,poise=info`) that means a failed
request logs its error with no request line above it, and a successful one is invisible. You
cannot tell whether the WebSub hub called us at all.

Configure it explicitly in `web/router.rs`: `INFO` span, `request_id` from the inbound
`x-request-id` or a counter, the route pattern rather than the raw URI (feed ids would blow up
cardinality), `method`, `path`, `status`, `duration_ms`, and `on_failure` at `ERROR`. No
bodies, no headers.

A 401 from `require_internal_secret` is a real signal: a deploy or a dashboard is holding the
wrong secret. It is currently silent, and it is one of the few 4xx worth a line.

---

## Startup and shutdown

Exactly one line each, so a deploy is visible without guessing:

```
Tracing initialized (filter, format, version)
Shard 1 of 3 selected intents [...]
Gateway logged in as <name>
TCP listener bound on 0.0.0.0:8080
Migrations applied
Ready: N workers started
--- SIGTERM ---
Draining
Stopped
```

Today the process logs its filter, intents, shard count, login and listen address, and then
nothing. There is no drain and no stop line, so a restart is indistinguishable from a crash.

`pretty` locally, JSON when `LOG_FORMAT=json`, since multiline pretty output breaks anything
line-oriented downstream. Neither `RUST_LOG` nor `LOG_FORMAT` is set by any compose file or the
Dockerfile today, so the defaults in `main.rs` are what production actually runs.

---

## Out of scope

No metrics exporter, no OpenTelemetry, no span on every function. Logs are the substrate here
and the only job of this document is to make them answerable. A metrics stack is a project, not
a convention, and it would not fix a single one of the problems above.

---

## Migration

Current state, for sizing the work: 1287 log calls (`debug` 394, `warn` 298, `error` 207,
`trace` 217, `info` 171), 43 of them interpolating into the message string, 375 starting with
"Failed to", 84 `inspect_err` sites, 100 `#[instrument]` attributes, 2 explicit spans, and 41
`tokio::spawn` calls of which 1 is instrumented.

In severity order, so each step is shippable on its own:

1. **Add `shared/logger.rs`** with `init`, `task::spawn`, and the `TraceLayer` config. Add the
   `process` root span in `main.rs`.
2. **Re-level the 207 `error!` calls** that are really expected Discord or Redis outcomes, down
   to `warn!`. Largest single win, and purely mechanical. Start with `temp_voice/service.rs`,
   `starboard/events.rs`, `message_logging/events.rs`, `moderation/`.
3. **Demote per-event `info!` to `debug!`.** `reaction_roles/events.rs`, `leveling/`,
   `custom_commands/`, `reporting/web.rs`.
4. **Promote audit-worthy `debug!` to `info!`** through a per-feature `audit.rs`:
   `moderation`, `verification`, `tickets`, `temp_voice` transfers.
5. **Strip narration** and the 43 interpolating messages.
6. **Convert the 41 spawns** to `task::spawn`, then delete the `#[instrument]`s that are no
   longer needed.
7. **Add the drain and stop lines.**

## Keeping it that way

`scripts/check-logging.sh`, a grep-based check rather than a clippy lint. Clippy has no rule
for log levels, and a rule nobody runs decays.

A plain `rg` for `error!` on one line gets this wrong: 61 of the 207 calls wrap across several
lines, so a line-based pattern cannot see whether `error` is on the next line. `log_calls.awk`
extracts each invocation whole, balancing parens and skipping string literals, so a ten-line
call is judged as one call. It emits 1287 records for the 1287 calls in `src/`, and the
per-level counts match a separate `rg -c` tally exactly.

```console
$ scripts/check-logging.sh
error! without a cause: src/features/verification/web/verify.rs:124
  add error = (a value), reason = (known cause), or fault = (broken invariant).
  Do not invent an io::Error to pass this.
interpolation in message: src/features/temp_voice/service.rs:71
  move the value into a field, see docs/logging.md
#[instrument(err)] double-logs: src/features/automod/safe_browsing.rs:37: #[instrument(
over info! budget (8): src/features/moderation/commands/actions.rs
```

Four rules, and what they currently find:

| Rule | Finds | Notes |
|---|---|---|
| `error!` names a cause | 26 | 11 interpolate the error into the message instead of using a field. 15 name no cause, and most of those are the `fault` case. |
| No `{}` in the message string | 78 | Exempts `format!`/`panic!`, where the braces belong to the format specifier. |
| No `#[instrument(err)]` | 3 | `automod/spam_tracker.rs` twice, `automod/safe_browsing.rs` once. |
| `info!` budget per file (default 8, `INFO_BUDGET` to change) | 2 | `moderation/commands/actions.rs` and `raid_detection/triggers.rs`. |

Of the 15 that name no cause, 9 are the `fault` case the table above exists for: four missing
captcha or verification env vars in `verification/web/verify.rs`, the missing
`INTERNAL_API_SECRET` in `social_notifications/subscription.rs`, the `CommandPanic` payload in
`core/error.rs`, the `i64` payout overflow in `gambling/audit.rs`, an uncomputable mute timestamp
in `automod/actions.rs`, and a blackjack split with no second card.

The other 6 already carry the cause under a name the check cannot see: `status = %status` on the
two upstream non-success responses, and `failed, total` on the WebSub renewal summary. Those are
still violations, because a reader cannot query them without knowing which field name each site
picked. The point of the three reserved names is predictability, not the presence of some field.

The check is a floor, not the convention. It cannot tell a `debug!` that is useful from one
that is noise, and it will never know whether an `info!` is justified. It catches the mechanical
drift; the level table above is what you still have to read.

Two known limits:

- It reads Rust, so a log line built through a helper macro or a `format!` into a string is
  invisible to it.
- `.github/workflows/deploy.yml` runs `on: push: main` with no `pull_request` trigger, so a
  check wired in there fires after merge rather than on the branch. Worth adding a `pull_request`
  trigger, or at least a `just` target, so the gate lands before the code does.

`trace!` deserves a fifth rule: 217 of them, and the default filter drops every one. Delete the
ones nobody turns on.
