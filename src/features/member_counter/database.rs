use serenity::model::id::GuildId;
use tracing::warn;

pub async fn any_guild_ids_with_member_counters(db: &sqlx::Pool<sqlx::Postgres>) -> Vec<GuildId> {
    let guild_ids: Vec<GuildId> = sqlx::query_scalar!(
        r"
        SELECT guild_id
        FROM guild_configs
        WHERE (settings->'member_counter'->>'enabled')::boolean = true
        ",
    )
    .fetch_all(db)
    .await
    .inspect_err(|e| warn!(error = ?e, "Failed to query active member counter guilds from DB"))
    .map_or_else(
        |_| Vec::new(),
        |rows| {
            rows.into_iter()
                .map(|id| GuildId::new(id.cast_unsigned()))
                .collect()
        },
    );
    guild_ids
}
