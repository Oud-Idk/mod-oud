# Dynamic Slowmode

Design agreed before implementation. Numbers in [Defaults](#defaults) are proposals, not settled
facts; the shape around them is.

## What it does

Watches a set of channels the admin names, and adjusts each one's Discord slowmode
(`rate_limit_per_user`) up and down in response to how busy that channel actually is.

The signal is **distinct authors per window** and **raw message volume**, combined with `max`: the
rung is whichever of the two asks for more. Either can raise the slowmode on its own, and neither can
hold it back, so a flood from few authors is throttled just as a crowd is.

That makes the author threshold the setting that decides whether one person can throttle a channel.
At a threshold of 1, a single member is enough to raise it, and volume alone can carry that same
member to the ceiling. A channel where one person flooding should stay automod's problem, not a
channel-wide throttle, needs an author threshold above 1.

## Non-goals

* Threads and forums. They need `EditThread` + `MANAGE_THREADS` (`threads.mdx:121`), and forum
  `default_thread_rate_limit_per_user` is copied at thread creation and never propagates
  (`channel.mdx:446`), so existing threads would each need their own PATCH. Deferred.
* Categories and announcement channels. The API does not accept `rate_limit_per_user` on them
  (`channel.mdx:435` omits Announcement, categories have no such field).
* Replacing automod or raid detection. Those act on individual members. This acts on a channel.
* Per-channel tuning knobs. The policy is guild-level; only the channel set is per channel.

## Decisions

| # | Decision | Chosen |
|---|---|---|
| 1 | Signal | Distinct authors and message volume, combined with `max` |
| 2 | Config scope | Guild-level JSONB policy plus an explicit channel list |
| 3 | Direction | Bidirectional, with hysteresis |
| 4 | Human edit | Channel disarms itself and waits for an explicit re-arm |
| 5 | Crash safety | Pre-automation value snapshotted, restorable |
| 6 | Counter write site | Inline in `dispatch::on_message`, before automod's short-circuit |
| 7 | Who writes | One global tick job under one Redis lock |
| 8 | Control law | Step ladder, 5 min minimum between edits per channel |
| 9 | Durability | Small Postgres table, Redis as the hot path |
| 10 | Scope | Explicit inclusion list, top-level text/voice/stage only |
| 11 | At the ceiling | Audit at `info!`, no message in the channel |
| 12 | Surface | Slash command group, dashboard page, bot status endpoint |
| 13 | Source of truth | Our last written value, reconciled by refetch and by the audit log event |

## Flow

### Counting (`events/dispatch.rs::on_message`)

Runs before `automod::handle_automod`, so messages automod is about to delete still count. A
channel where automod fires constantly is by definition hot.

Skips: DMs, bot authors, webhooks. Counts everyone else, including staff and members with
`BYPASS_SLOWMODE`, because serenity 0.12.5 has no `BYPASS_SLOWMODE` variant
(`model/permissions.rs:410`) and a partially detectable exemption makes the counter's meaning
depend on the crate.

One `MULTI` per message, same shape as `automod/cache.rs:90-122`:

```
ZREMRANGEBYSCORE authors 0 now-window
ZADD             authors now member=<user_id>
ZREMRANGEBYSCORE volume  0 now-window
ZADD             volume  now member=<now, random u16>
EXPIRE authors window*2
EXPIRE volume  window*2
```

`member=<user_id>` on the authors ZSET makes the count distinct by construction; a repeat message from
the same author updates the score rather than adding a member.

Reads use `ZCOUNT key (now-window) now` rather than `ZCARD`. Pruning only happens on write, so a
channel that has gone quiet would otherwise keep reporting its last burst until the key expired,
holding its slowmode up for up to two windows after the traffic stopped.

### Deciding (`features/dynamic_slowmode/jobs.rs`)

A single `task::spawn` loop, 15s sleep, guarded by one Redis lock, spawned from `core/setup.rs`.
Single writer cluster-wide, which is the property that matters: serenity cannot see the
undocumented channel-edit sublimit, so two instances racing on the same channel have no way to back
off.

Per tick, over every armed row in the state table:

1. Load the guild policy from `GuildSettings.dynamic_slowmode`, cached per guild for the tick.
2. Retire the row if the channel is no longer covered by an enabled policy: restore the
   pre-automation value and delete the row. This is the only path that notices a dashboard edit,
   because the dashboard writes JSONB and never runs a command. Retiring is not gated by the
   minimum edit interval: it is a single final edit, not a repeated one, so a toggle takes effect on
   the next tick.
3. Skip the channel if it is not due (see pacing) or is benched after a 429.
4. Read author count and volume count from Redis.
5. Compute the target rung.
6. If it equals `last_written_secs`, do nothing. This is the hysteresis, and it is what stops the
   stale-serenity-cache problem from turning into a PATCH every tick: the cache is not updated by
   an edit, only by `CHANNEL_UPDATE` (`serenity/cache/event.rs:65`), so the cache is never the
   input to this comparison.
7. Otherwise PATCH with an audit log reason, then write `last_written_secs`.

Then, once per tick, the mirror of step 2: arm any channel an enabled policy covers that has no row
yet. A channel added from the dashboard never runs a command, so nothing else creates its row, and a
channel with no row is invisible to the scan above. A guild with the policy on is found by querying
`guild_configs` on the `enabled` flag, which is indexed by
`idx_guild_configs_slowmode_enabled` so the large `settings` blobs are never scanned. Only a channel
with no row at all is armed; a row that exists but is disarmed is left alone, because a disarm is a
deliberate stop that only an explicit re-arm clears.

The tick scans the table rather than a "guilds that saw traffic" Redis set. A set that is cleared
each tick can drop a guild between the read and the clear, and a channel whose traffic is never
re-examined stays at whatever value it was left at. The scan is one indexed query over a handful of
rows, which is cheaper than the failure mode.

### Human edits (`features/dynamic_slowmode/events.rs`)

`FullEvent::GuildAuditLogEntryCreate` is already dispatched at `src/events/dispatch.rs:271`. A
`CHANNEL_UPDATE` (action type 11) whose `changes` include `rate_limit_per_user`
(`serenity/model/guild/audit_log/change.rs:233`) and whose `user_id` is not our own id means a
human or another app touched the channel. Disarm it immediately.

Lazy backstop: `jobs::write_slowmode` refetches the live value immediately before every PATCH and
disarms if it disagrees with `last_written_secs`. That costs one GET per edit, and edits are capped
at one per channel per five minutes, so it is cheap insurance against an audit entry we never saw.

`reason` on our own PATCHes is set with `EditChannel::audit_log_reason` as corroboration, but
`user_id` is the discriminator, because the docs do not guarantee `reason` is absent when none was
supplied.

## State machine

```
              arm                    target != current, due
   Disarmed ────────► Armed ──────────────────────────────► Active
       ▲                ▲                                      │
       │                │            human edit, or           │
       │                └──────────── rearm ──────────────────┤
       │                                                       │
       └────────────  disable, or channel removed  ◄───────────┘
```

A 429 does **not** disarm. It benches the channel in Redis for 15 minutes and leaves the row armed,
so automation resumes by itself when the bench expires. Disarming on a transient 429 would require
an admin to notice and re-arm, which is exactly the wrong shape for a limit we cannot observe.

`Armed` and `Active` differ only in whether we have written a value yet. Both hold
`pre_automation_secs`, the value the channel had when it was armed.

Restore on disable and on channel removal: if the channel's live value still equals
`last_written_secs`, write `pre_automation_secs` back. If it does not, a human changed it since, so
leave it alone. Arming re-snapshots the current value, so a re-arm after a manual edit starts from
the moderator's value rather than the pre-automation one.

The tick also retires a row whose policy no longer covers it. Turning the feature off or removing a
channel from the dashboard writes JSONB and never runs a command, so without that the channel would
be left at whatever slowmode the bot last set, with no record of why.

A restore that Discord refuses with a 429 keeps the row armed and benches the channel, so the tick
retries it after the bench. Commands do not disarm first; the policy change alone is what stops the
channel being automated.

## Storage

### Policy (guild JSONB)

`GuildSettings.dynamic_slowmode: Option<Box<DynamicSlowmodeConfig>>`, following the existing shape
at `core/config/settings.rs:29-80`. Inner fields `#[serde(rename_all = "camelCase")]` per
`CONVENTIONS.md`.

```rust
struct DynamicSlowmodeConfig {
    enabled: bool,
    channels: Vec<ChannelId>,        // explicit inclusion list
    ceiling_secs: u16,               // highest rung we will ever write
    author_thresholds: Vec<u32>,     // one per rung above 0
    volume_thresholds: Vec<u32>,
    window_secs: u64,
}
```

`channels` is the only per-channel thing in the policy. Everything else applies guild-wide.

### State (Postgres)

```sql
CREATE TABLE dynamic_slowmode_channels (
    channel_id          BIGINT PRIMARY KEY,
    guild_id            BIGINT NOT NULL,
    pre_automation_secs SMALLINT NOT NULL,
    last_written_secs   SMALLINT NOT NULL,
    last_edit_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    armed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disarmed_at         TIMESTAMPTZ,
    disarm_reason       TEXT
);
CREATE INDEX idx_dynamic_slowmode_channels_guild_id
    ON dynamic_slowmode_channels (guild_id);
```

`last_edit_at` is what paces the next edit, so it is written alongside every value change. On arming
it is backdated by the minimum edit interval, so the first edit can happen on the next tick. Arming
is not an edit to Discord, and a channel armed while it is busy should be dealt with before the
burst that motivated it has passed. A re-arm by an admin behaves the same way, so resuming
automation after a human edit takes effect promptly.

A row exists only for channels we are armed on or have written to. Deleted on channel removal from
the policy. Written only when the value actually changes, which the 5 minute minimum interval
already bounds.

The table is the durable record, so a Redis flush cannot strand a channel at a value we set. The
audit log is a third, independent recovery path for 45 days (`audit-log.mdx:11`), not the primary
mechanism.

### Hot path (Redis)

Three key getters, so they live in `keys.rs` per `CONVENTIONS.md:31-34`:

| Getter | Key |
|---|---|
| `authors_key` | `slowmode:authors:{guild_id}:{channel_id}` |
| `volume_key` | `slowmode:volume:{guild_id}:{channel_id}` |
| `bench_key` | `slowmode:bench:{channel_id}` |

`bench_key` is the 429 circuit breaker, `SET EX 900`.

## Control law

### Ladder

Rungs are the values Discord's own UI offers, so every value the bot writes is one an admin
recognises and can reproduce by hand: `0, 5, 10, 15, 30, 60, 120, 300, 600`.

The target is `max(author_rung, volume_rung)`, clamped to `0..=ceiling_secs` and then to
`0..=21600`. The clamp is ours to make: `EditChannel::rate_limit_per_user` takes a plain `u16` and
does no range validation (`edit_channel.rs:198`), so an out-of-range value compiles and is rejected
by the API.

### Hysteresis

* Raise: straight to the computed rung, no dwell time beyond the pacing interval.
* Decay: exactly one rung per edit, and an edit only happens when the pacing interval has elapsed.
  So the decay cadence is the pacing interval (5 minutes) and a drop from 60s to 0 takes four of
  them, matching the climb.

Decay is measured per *edit*, not by how long the channel has been quiet. Measuring quiet time
instead looks equivalent and is not: a channel that stays hot at the same value never edits, so its
clock is never reset, and the first quiet tick after a long hot spell would collapse the whole
ladder in one step.

### Pacing

The channel-edit sublimit is undocumented and no source says whether `rate_limit_per_user` is in
it. Staff confirmed the sublimits exist but are tracked inline without headers
(`discord-api-docs#2761`). Serenity keys buckets by route plus channel id and never parses
`X-RateLimit-Bucket` (`http/routing.rs:89`), so it cannot pre-empt a hidden limit, and on 429 it
reads only the `retry-after` header in an unbounded retry loop (`http/ratelimiting.rs:182`,
`:363`). An observed sublimit 429 carried `retry-after: 15` in the header and `577` in the body
(`#2190`), so serenity would retry about 38 times, and 429s count toward the 10,000 invalid
requests per 10 minutes Cloudflare threshold (`rate-limits.mdx:132`).

Therefore:

* Minimum 5 minutes between any two edits to the same channel, in either direction. Two per 10
  minutes, which sits at the rumoured boundary.
* At most 10 channels edited per tick, so a burst of 40 newly hot channels spreads over several
  ticks instead of landing at once. Combined with the per-channel floor this caps the write rate
  without a separate token bucket; if a guild ever has enough channels to need one, it is an
  additive limiter, not a redesign.
* A 429 on a PATCH, or on a restore, benches that channel for 15 minutes (`bench_key`) and logs at
  `warn!` with `channel_id` and `guild_id`. The channel stays armed and resumes when the bench
  expires. Serenity's own retry loop is not trusted to resolve it.

Accepted consequence: 0 to 60s takes about 20 minutes of sustained heat, and full decay takes the
same. This is slow for a raid. The alternative is a plausible Cloudflare ban from a bot retrying a
hidden limit dozens of times.

### At the ceiling

Log at `info!` via `audit.rs` with `event = "slowmode_ceiling_reached"`, once per channel per
`armed_at` (not per tick), and expose it in the dashboard. No message in the channel: posting into
a channel you are trying to quiet is self-defeating. No hand-off to automod or raid detection:
those already run their own rules on the same messages.

## Surfaces

### Slash command group `/slowmode`

`enable`, `disable`, `channel add`, `channel remove`, `info`, `rearm`, mirroring
`media_only/commands.rs`. `MANAGE_CHANNELS` required. Defers immediately, because it touches the
database. `channel add` refuses categories, announcements, threads, and forums with a clear
message rather than silently doing nothing.

### Dashboard

Page under the "Moderation & Security" group in `SidebarLinks.tsx:76`, with config through
`getGuildConfigField` / `saveGuildConfigField` (`dashboard/src/features/_shared/guild.ts:48`,
`:69`) and live state through `backendFetch`.

### Bot status endpoint

`GET /api/guilds/{guild_id}/slowmode/status`, merged into the internal router
(`src/web/router.rs:86`), same shape as `raid_detection/web.rs:28`. Returns the policy plus, per
channel: the value the bot last wrote, the pre-automation value, live author and volume counts,
whether it is armed, and a human-readable status line.

## Files

```
src/features/dynamic_slowmode.rs            # contract: the exported surface only
src/features/dynamic_slowmode/
├── commands.rs      # /slowmode group
├── types.rs         # DynamicSlowmodeConfig, SlowmodeChannelState, DisarmReason, constants
├── calculation.rs   # counts -> rung -> next value, decay, pacing
├── events.rs        # audit log entry -> disarm
├── counter.rs       # inline MULTI write from on_message
├── cache.rs         # counter read/write, bench key
├── keys.rs          # three key getters
├── database.rs      # state table, RawSlowmodeChannel
├── jobs.rs          # the tick, the startup reconcile
├── audit.rs         # typed info! events
└── web.rs           # status endpoint
migrations/20261024120000_dynamic_slowmode.sql
dashboard/src/features/dynamic-slowmode/{types,queries,actions}.ts
dashboard/src/features/dynamic-slowmode/components/DynamicSlowmode{Feature,Body}.tsx
dashboard/src/app/dashboard/[guild_id]/dynamic-slowmode/page.tsx
```

Wiring touches: `src/features.rs`, `src/main.rs::build_commands`, `src/events/dispatch.rs` (the
count call in `on_message`, the audit handler), `src/core/config/settings.rs` (one field),
`src/core/setup.rs` (worker spawn plus the startup reconcile), `src/web/router.rs` (one `merge`).

`calculation.rs` holds the pure part: given counts, window, and policy, return a rung. It is the
only file with unit tests, because it is the only part with no I/O. The dashboard has the usual
`types`/`queries`/`actions` test trio.

## What is not built yet

* Threads and forums. Deliberately out of scope, and `channel add` refuses them.
* A token-bucket write limiter. Not needed at the current edit budget; the per-tick cap and the
  per-channel floor are the rate control.
* Per-channel overrides of the thresholds. The policy is guild-wide on purpose.

## Defaults

Proposed, to be sanity-checked against a real server before merge.

| Setting | Default | Why |
|---|---|---|
| Tick interval | 15s | Cheap scan, and faster than the 5 min pacing makes pointless |
| Measurement window | 60s | Long enough that a burst is not invisible, short enough to react |
| Ladder | 0/5/10/15/30/60/120/300/600 | Discord UI values |
| Ceiling | 300s | 600s exists as a rung but is off unless an admin raises the ceiling |
| Author thresholds | 4/6/9/13/18/24/30/40 | Distinct authors per 60s, one per rung above 0 |
| Volume thresholds | 16/26/38/56/78/104/130/170 | About 4 messages per author |
| Decay | one rung per edit | Same 5 min cadence, so decay costs no extra edits |
| Min edit interval | 5 min per channel | Two per 10 minutes |
| Edits per tick | 10 | Burst spreading; with a 5 min per-channel floor this is the effective rate cap |
| 429 bench | 15 min | Longer than the observed sublimit window |

The author thresholds are the ones most likely to be wrong. A busy general channel in a large
server can see 20 distinct authors in a minute while being perfectly healthy, and the ladder would
push it to 60s. That is why the feature is opt-in per channel and why the dashboard must show live
counts next to the thresholds, so an admin can see what their own traffic looks like before
trusting the numbers.
