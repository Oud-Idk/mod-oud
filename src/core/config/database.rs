use crate::core::config::settings::GuildSettings;
use anyhow::Context;
use sqlx::PgPool;

/// Gets a guild config from database.
///
/// # Errors:
/// Returns `Err` if database failed to execute query.
pub async fn save_settings_to_db(
    db: &PgPool,
    guild_id: u64,
    settings: &GuildSettings,
) -> anyhow::Result<()> {
    let json_value = serde_json::to_value(settings)
        .with_context(|| format!("Failed to serialize GuildSettings for guild_id {guild_id}"))?;

    sqlx::query!(
        r#"
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, $2)
        ON CONFLICT (guild_id)
        DO UPDATE SET settings = EXCLUDED.settings
        "#,
        guild_id.cast_signed(),
        json_value
    )
    .execute(db)
    .await
    .with_context(|| {
        format!("Failed to save guild settings to database for guild_id {guild_id}")
    })?;
    Ok(())
}

/// Gets a guild config from database.
///
/// # Errors:
/// Returns `Err` if database failed to return data.
pub async fn get_settings_from_database(
    db: &PgPool,
    guild_id: u64,
) -> anyhow::Result<Option<serde_json::Value>> {
    let row = sqlx::query!(
        "SELECT settings FROM guild_configs WHERE guild_id = $1",
        guild_id.cast_signed()
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.settings))
}
