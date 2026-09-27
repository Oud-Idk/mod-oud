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

The function is the log line, so the action site calls `audit::member_banned(...)` instead of
writing one. That is what removes the duplicate: a kick used to log twice, once in the command
handler and once in the issuing function, with different wording. Two consequences worth knowing:
`audit.rs` is exempt from the per-file `info!` budget, and a worker that closes a ticket with
nobody clicking anything reports `actor` or `closer_id = None` rather than a made-up moderator.

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
  Product names, acronyms and env vars keep their capitals, and so do the lifecycle lines printed
  above: `Tracing initialized`, `TCP listener bound`, `Draining`. There are 41 like that.
- Everything else is a field. The message stays one short sentence.
- Field names are domain names: `guild_id`, `channel_id`, `user_id`, `message_id`, `command`,
  `job`, `event`, `outcome`, `duration_ms`. Never `id`, `e`, `ctx`, `data`, `thing`.
- Never log message content, tokens, or a response body from an authenticated API. A body from
  a keyed endpoint can echo the key back, and a `reqwest::Error` embeds the full request URL in
  **both** its `Display` and its `Debug`, so `error = %e` and `error = ?e` are both a way to print
  a key. `shared::http` is the tool for this and the test is the reason to believe it:
  `redact_url` for the URL, `safe_reqwest_error` for the error, `body_bytes` for the body. Worse,
  a keyed `reqwest::Error` must never enter an `anyhow` chain, because anything above that prints
  the chain prints the key. Map it at the HTTP call, as `automod/safe_browsing.rs` does.
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

The second clause is doing more work than it looks. A web handler that answers a bare
`500 Internal server error` has destroyed the cause: the axum boundary logs
`error!(reason = 500, "http request failed")` and the status is all that survives. So a handler
that collapses its error to a generic one **must** say which call failed, and that is not a second
log of the same failure, it is the only record of it. `verification/web` collects its errors into
the response instead, which is a third fate and the same rule: the fate is decided there, so it
logs there.

The line that is actually banned is the duplicate: the same `Err` printed once at the site and
again at the boundary. `search/http.rs` is the shape to copy, where `get_json` logs the provider,
the redacted url and a described error, then returns a generic one so the raw error reaches
neither the log nor a user.

The boundaries are `core::error::on_error`, the top-level `match` in each worker loop, the axum
error path, and the fallible functions in `main.rs`. Nothing else logs a propagated error.

This is also why `#[instrument(err)]` is banned: it logs the error on the way out, and so does
the boundary, and the two lines share no id. Same for an `#[instrument]` function that also
contains `error!` in its body. Pick one, and for anything returning `Result` the answer is the
boundary.

---

## Spans go at the boundary, not the leaf

Six spans, opened where work is admitted. Everything downstream inherits them for free.

| Span | Fields |
|---|---|
| `process` (root, in `main`) | `shard_id`, `shard_count`, `log_filter` |
| `dispatch_events` | `event`, `guild_id`, `channel_id`, `user_id` |
| each worker | `job` |
| each HTTP request | `request_id`, `method`, `path` |

Two rows this table used to claim are not here, and the reason is worth keeping:

- **There is no poise command span.** Poise 0.6 creates none and nothing here wraps a command
  either. What carries `command`, `guild_id` and `user_id` is `core::error::on_error`, the command
  boundary, as fields on the lines it logs. Adding a real span means configuring the framework.
- **There is no per-worker-iteration span.** `shared/task.rs` opens one `job` span for the whole
  future, and `duration_ms` is a field on the outcome line it logs at the end. The "acquiring lock"
  and "lock acquired" pairs those workers used to log were standing in for the missing iteration
  marker, which is why deleting them lost a little.

Both are worth adding eventually. Until then, a line about a command carries its ids from
`on_error`, not from an enclosing span.

The root span matters more than it looks: it is the only way to tell which shard a line came
from.

`dispatch_events` is the one boundary span at `debug`, because it is the only one that fires per
event rather than per unit of work. Serenity dispatches 79 variants and the dispatcher handles 16,
so the rest would each print an empty enter and exit pair. A disabled span is free: the per-event
lines inside it are dropped with it, and an operator who wants to tie a line to its event is doing
per-event diagnosis anyway.

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

Those 4 were the only instrumented spawns of 43; the other 39 could not be tied back to the event
that caused them, which is why a panic in a worker loop surfaced with no indication of which
worker died.

Do not hand-roll it. One helper, in `shared/task.rs`, next to `logger.rs`:

```rust
pub fn spawn<F>(name: &'static str, fut: F) -> JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
```

It opens `info_span!("job", job = name)`, attaches it, and logs exit with outcome and
duration. Every background task goes through it, so each is named, has an outcome, and reports
how long it ran. `starboard/events.rs` nests its own span inside so its per-iteration lines keep
`starboard_id` and `msg_id`.

---

## HTTP requests are visible at the default filter

`TraceLayer::new_for_http()` puts its request span at `DEBUG` and its failure line at `ERROR`.
Under the default filter (`info,sqlx=warn,serenity=warn,poise=info`) that means a failed
request logs its error with no request line above it, and a successful one is invisible. You
cannot tell whether the WebSub hub called us at all.

So `web/router.rs` uses a `route_layer` middleware instead of `TraceLayer`: `INFO` span,
`request_id` from the inbound `x-request-id` or a counter, the route pattern rather than the raw
URI (feed ids would blow up cardinality), `method`, `path`, `status`, `duration_ms`, and the
5xx case at `ERROR`. No bodies, no headers. `route_layer` rather than `layer` because only the
former runs once routing has matched, which is what makes `MatchedPath` readable; the 404
fallback is not a match and keeps its own line.

A 401 from `require_internal_secret` is a real signal: a deploy or a dashboard is holding the
wrong secret. It is one of the few 4xx worth a line, and it is logged.

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

All nine are emitted. The signal is a field rather than a line of its own, so
`signal="SIGTERM"` is queryable.

`pretty` locally, JSON when `LOG_FORMAT=json`, since multiline pretty output breaks anything
line-oriented downstream. Neither `RUST_LOG` nor `LOG_FORMAT` is set by any compose file or the
Dockerfile today, so the defaults in `shared/logger.rs` are what production actually runs.

---

## Out of scope

No metrics exporter, no OpenTelemetry, no span on every function. Logs are the substrate here
and the only job of this document is to make them answerable. A metrics stack is a project, not
a convention, and it would not fix a single one of the problems above.

---

## Migration

Current state, for sizing the work: 1080 log calls (`debug` 426, `warn` 412, `trace` 30,
`info` 116, `error` 96), 0 of them interpolating into the message string, 0 starting with
"Failed to", 0 "Successfully", 0 trailing periods, 41 starting with a capital, 84
`inspect_err` sites, 100 `#[instrument]` attributes, 6 explicit spans, and 42 `task::spawn`
call sites. The only `tokio::spawn` left is the one inside the helper.

In severity order, so each step is shippable on its own:

1. **Done.** `shared/logger.rs` with `init` and `task::spawn`, the `process` root span, and the
   per-request `http_request` span in `web/router.rs`.
2. **Done.** 140 of the 212 `error!` calls were expected Discord or Redis outcomes and are now
   `warn!`. The 72 that remain are the ones a human has to fix: the boundaries in
   `core/error.rs`, the `fault` cases, Postgres writes to authoritative tables, audit-trail
   inserts, and the raid rollback and snapshot paths, where a failure leaves a guild stuck in
   raid mode.
3. **Done.** Per-event `info!` is now `debug!` in `reaction_roles/events.rs`, `leveling/`,
   `custom_commands/`. `reporting/web.rs` keeps `info!`, because a dashboard-issued ban or warn
   is an action taken.
4. **Done.** `moderation`, `verification`, `tickets` and `temp_voice` each have an `audit.rs`, and
   the action sites call one typed function per event instead of writing a log line. `temp_voice`
   covers transfers only: channel creation and teardown fire per voice event and stay at `debug!`.
5. **Done.** Narration stripped and every interpolated message turned into fields.
6. **Done.** All 41 background tasks go through `task::spawn`, so each has a name, an outcome and
   a duration. Nothing was deleted for it: the `#[instrument]`s were never on the spawned
   functions, they sit on the feature entry points, and they carry the ids (`orig_msg_id`,
   `reaction`) their inner lines rely on. `starboard/events.rs` had hand-rolled its own span and
   now nests a `starboard` span under the `job` one, so it keeps its ids and gains an exit line.
7. **Done.** The drain and stop lines.

Afterwards, the `dispatch_events` span went in, closing the last gap in the table above. It pulls
the guild, channel and user out of the gateway event into `subject_of`, so every line a feature
emits inherits the ids without the feature repeating them.

The banned openers went next, 55 messages that still began "failed to", "unable to", "cannot" or
"starting", which step 5 had missed. Each became a noun-first clause, split by what the operation
is: a discrete action takes "not Yed" (`reaction role not removed`), a noun-phrase operation takes
"failed" (`message cache write to redis failed`). Two were deleted rather than reworded, because
the doc already said not to log them: `ticket_logger` announced a flush that the line below it and
the `#[instrument]` both already reported, and `verification/web/setup.rs` warned about an `Err`
that reaches the axum boundary, which logs every 5xx on its own.

The last placeholder field names went with them, seven `id =` and one `value =`. Every one had a
domain name in scope at the call site: `bot_id` beside `bot`, `custom_id` beside a local of the same
name, `config_id` and `giveaway_id` after the variable they came from, and `raw_value` for the
unparsed text a dashboard row held. `key` and `value` in `locking.rs` are left alone, because there
`value` is the lock's own fencing token and the pair is the domain.

Reporting then got the same treatment, 30 lines of it, since it had the most: gerunds announcing
the next line, and `info!` on the dashboard's four moderation actions written *before* the action
with no ids at all. The doc puts `info!` at "actions taken", so each of those moved to after the
action and gained `report_id`, `guild_id`, `user_id` and `moderator_id`. Four were `info!` with an
empty field list, which is the worst case: an operator-timeline line that cannot be tied to
anything.

**One thing left deliberately.** Nine `#[instrument]` functions also contain `error!`, which the
letter of the "log a failure once" rule rejects. A plain `#[instrument]` does not log the error, so
there is no duplicated line, only a rejected shape. The decision is to leave them, on the grounds
that the rule's reasoning beats its letter.

The 15 sites that named a fallback in the message prose now carry a `fallback` field, valued so a
query can tell the routes apart: `"db"` three times, `"default layout"` four, `"http"`,
`"postgres"`, `"redis"`, `"defaults"`, `"bot id"`, and so on. Two sites that said "fallback" were
not one: `join_leave/messages.rs` already had `fallback_channel_id` as a field, and
`moderation/issuing.rs` names an invite's purpose rather than a path it took. Honeypot's ban notice
was the opposite case, two parallel branches failing to send with no fallback in sight, so it takes
a `notice` field naming whose template failed. Nothing in the check enforces any of this.

Then the rest of the tree, which is where the bulk of it was. 1292 calls went to 1052 across 30
features. The two shapes were a present participle announcing work not yet done (`fetching X`,
`attempting to X`, `invoked X command`) and a bare infinitive naming an operation on a `warn!` or
`error!` (`write settings to Redis cache`). A sentence-initial participle is announcing by
construction, so the judgement each time was delete, move, or restate: delete where a specific line
already covered the step or the enclosing `#[instrument]` reported the entry, move where an `info!`
announced an action the doc wants logged after it taking, restate where the line was the only
record of that step. No level changed anywhere in the sweep, checked by comparing each message's
level set before and after rather than by reading the diff.

Four things came out of it that were not narration at all:

- `warning/thresholds.rs` had `debug("Inserting automod-log for threshold")` next to
  `use tracing::field::debug`. That binds to the field constructor, not the macro, so it compiled
  to a discarded expression and had never logged anything. Rule 5 exists because of it.
- `moderation/commands/category.rs` logged "command ran in a server" from inside the
  `guild_id.is_none()` branch, so it said the opposite of what happened.
- `music/web.rs` logged `expected = %expected` on a failed ticket check. That is a valid HMAC for
  `(guild_id, user_id, expires, purpose)`, which is exactly what `verify_ticket` accepts, so it was
  a replayable credential in the log.
- `spotify.rs` and `youtube.rs` logged whole response bodies, and the YouTube call carries `key=`
  in its query string. They now log `body_bytes` and a `redact_url`, which is the shape
  `search/genius/client.rs` already used.

The `anyhow` context strings were swept at the same time, since they reach the log through
`error_chain` at every boundary. The two user-facing item strings in `economy` were left alone:
they are shown to a user, not logged.

## Keeping it that way

`scripts/check-logging.sh`, a grep-based check rather than a clippy lint. Clippy has no rule
for log levels, and a rule nobody runs decays.

A plain `rg` for `error!` on one line gets this wrong: 61 of the 211 calls wrap across several
lines, so a line-based pattern cannot see whether `error` is on the next line. `log_calls.awk`
extracts each invocation whole, balancing parens and skipping string literals, so a ten-line
call is judged as one call. It emits records for every call in `src/`, and the per-level counts
match a separate `rg -c` tally exactly.

```console
$ scripts/check-logging.sh
logging checks passed
```

Six rules, all currently at zero, and gating in CI. The rules are a floor: they cannot tell
whether a level is right, only whether the shape is. Step 2 in particular is a judgement the
check will never revisit, so a re-level that undoes one of the 72 has to be argued for rather
than waited for a red build.

| Rule | Finds | Notes |
|---|---|---|
| `error!` names a cause | 0 | |
| No `{}` in the message string | 0 | Exempts the formatting macros, where the braces belong to the format specifier. |
| No `#[instrument(err)]` | 0 | |
| `info!` budget per file (default 8, `INFO_BUDGET`) | 0 | `audit.rs` is exempt: every line in one is an action taken, which is what `info!` is for. |
| `warn!` budget per file (default 13, `WARN_BUDGET`) | 0 | Same exemption. |
| `level(` is not `level!(` | 0 | Not an awk rule: the extractor only matches `level!(`, so the mistake it catches is invisible to it by construction. |

**The budgets are ratchets, not diagnoses, and the `warn!` one is weaker than it looks.** Count
per file measures how chatty a file is, not how often it fires, and on this tree the two disagree
sharply. Every file over the `warn!` budget is a worker on a timer or a rare-event handler:
`social_notifications/jobs.rs` on a 30s loop, `raid_detection/raid_end.rs` on raid end,
`verification/web/setup.rs` on panel setup. Meanwhile every handler that runs per message sits
comfortably under it, at 5 or 6. So the rule pressures the files that fire least and would not
notice a per-message flood. It is set to 13, the current maximum and therefore green today: a gate
that is red on arrival gets switched off.

It was 15 until the level audit demoted a batch summary in `social_notifications/jobs.rs` to
`warn!`, pushing that file to 16 and turning the gate red. The fix was not to raise the budget,
which is how a ratchet dies, but to do the extraction this section used to recommend. Both workers
in that file repeated the same four-outcome shape around `acquire_lock` / `release`, so
`run_under_lock` owns it now, which took the file to 13 and the budget down with it. The other
workers still repeat the shape, and are why two files sit at the maximum.

The rule that would actually catch a flood is not a count. It is that a `warn!` has to name
something you can query, because a `warn!` with no field at all fails this doc's own test, which
is whether someone will read the line and do something. There are 28 such `warn!` in the tree.
About six are legitimate: they report a config fact at startup, where there is nothing to
correlate and an id would be invented. The rest are missing an id that is in scope at the call
site, `config_id` beside `giveaways/database.rs`, `cmd.report_id` beside
`reporting/web/resolve.rs`, the redis key beside `tickets/jobs/ticket_sync.rs`. That rule cannot
be enforced as written, because it would flag the six config warnings, and an exemption list is
worse than the rule is worth. It is the more valuable of the two, though, and the 34 are a
worklist rather than a permanent exemption.

Rule 2's exemption has to name the formatting macros explicitly. Written as `[a-z_]+!` it also
matches `trace!` and `info!`, which strips every single-literal log call before the brace check
runs, and hides the violations it exists to catch.

Rule 5 exists because a line can be a log call, look like one, compile clean and log nothing:
`debug("x")` binds to `tracing::field::debug`, the field constructor. It has to skip `fn` headers,
since poise's command handlers are literally `pub async fn info(`, or the rule fires on the whole
tree.


The check is a floor, not the convention. It cannot tell a `debug!` that is useful from one
that is noise, and it will never know whether an `info!` is justified. It catches the mechanical
drift; the level table above is what you still have to read.

One known limit: it reads Rust, so a log line built through a helper macro or a `format!` into a
string is invisible to it.

`trace!` deserves a fifth rule: 213 of them, and the default filter drops every one. Delete the
ones nobody turns on.
