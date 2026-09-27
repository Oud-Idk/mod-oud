# Database

The `Raw DTO` pattern every `database.rs` must use, plus the snowflake and transaction rules.
Read this before writing or reviewing a query.

Moved out of `CONVENTIONS.md`.

---

## Raw DTO Pattern

All `database.rs` files MUST use the **Raw DTO** pattern — never inline row mapping inside `query!`.

1. **Raw struct per domain model, inline in `database.rs`.** For each domain model (`Item`, `Balance`, `InventoryRow`, etc.) define a DB-mirroring counterpart (`RawItem`, `RawBalance`, …) at the top of that feature's `database.rs`. It MUST `#[derive(sqlx::FromRow)]`, use `i64` for every Discord snowflake (`GuildId`, `UserId`, `ChannelId`, `RoleId`, `MessageId` → `i64` / `Option<i64>`), and keep all other columns at their Postgres types (`i32`, `bool`, `Uuid`, `Value`/`Json<T>`, `DateTime<Utc>`, `Vec<T>`). Do NOT put Raw structs in `types.rs` or `shared/` — duplicate per file is intentional (Golden Rule).

   ```rust
   #[derive(sqlx::FromRow)]
   struct RawItem {
       id: Uuid,
       guild_id: i64,
       name: String,
       price: i64,
       // ...
       requirements: serde_json::Value,
       expires_at: Option<DateTime<Utc>>,
   }
   ```

2. **`From<Raw>` owns the snowflake conversion.** Implement `From<RawX> for X` right below the Raw struct. All `i64 → GuildId/UserId/…` conversions live there, via `GuildId::new(r.guild_id.cast_unsigned())` (and `.map(|id| RoleId::new(id.cast_unsigned()))` for `Option<Vec<i64>>`). No `cast_unsigned()` outside the `From` impl; no `Type::from_raw()` helpers.

   ```rust
   impl From<RawItem> for Item {
       fn from(r: RawItem) -> Self {
           Self { guild_id: GuildId::new(r.guild_id.cast_unsigned()), .. }
       }
   }
   ```

3. **Queries use `query_as!(Raw, …)` + `Into::into`.** Every `SELECT`/`RETURNING` that materializes a domain model MUST be `sqlx::query_as!(RawX, r#"..."#, guild_id.get().cast_signed(), …)` and convert with `.map(Into::into)`:
   - `fetch_optional` → `.await?.map(Into::into)`
   - `fetch_one` → `.await?.into()` or `.await.map(Into::into)?`
   - `fetch_all` → `.await.map(|rows| rows.into_iter().map(Into::into).collect())`
   - joined rows (e.g. inventory + item + `quantity`) define a dedicated `RawInventoryItem { …, quantity: i32 }` and map to `(Item, i32)`.

   Keep `sqlx::query!` only for pure `INSERT`/`UPDATE`/`DELETE` without a domain return (`.execute()`), and `query_scalar!` for scalar counts/IDs. Preserve `as "col: Type"` overrides only when the `FromRow` type needs it (`Json<T>`, enums like `ReportStatus`, `InteractionMode`).

4. **Examples live inline.** See `src/features/economy/database/items.rs` (`RawItem`), `balances.rs` (`RawBalance`), `warning/database.rs` (`WarningInfoRow`), `media_only/database.rs` (`MediaOnlyChannelRow`) as canonical references.

---

## Snowflakes

All `guild_id` args should be `u64`, then convert to `i64` at the SQLx statement using
`.cast_signed()`. And the other way around (SQLx guild ID comes out as `i64`), use
`.cast_unsigned()`.

The conversion lives in exactly one place per struct: the `From<Raw>` impl, per rule 2 above. A
`cast_unsigned()` in a query body means the conversion is about to drift.

---

## Transactions

Never hold a DB transaction across `await` points unless strictly necessary. Keep transactions as
short as humanly possible to avoid pool starvation.

If cash or inventory is involved, the commit is the interesting line: comment which work happens
before it and which happens after, so a reader can see that buy-actions run in a separate
transaction on purpose rather than by accident.
