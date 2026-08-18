use crate::features::automod::{RuleAction, RuleScope};
use crate::features::bad_words::types::{BadWordRuleset, Pattern};
use serenity::all::GuildId;
use sqlx::PgPool;
use sqlx::types::Json;

pub async fn fetch_bad_word_rows(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<BadWordRuleset>, sqlx::Error> {
    let records = sqlx::query!(
        r#"
        SELECT
            id, guild_id, name, enabled,
            patterns as "patterns: Json<Vec<Pattern>>",
            actions as "actions: Json<Vec<RuleAction>>",
            timeout_duration_seconds,
            scope as "scope: Json<RuleScope>"
        FROM bad_word_rulesets
        WHERE guild_id = $1 AND enabled = true
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await?;

    let rulesets = records
        .into_iter()
        .map(|rec| BadWordRuleset {
            id: rec.id,
            guild_id: GuildId::from(rec.guild_id.cast_unsigned()),
            name: rec.name,
            enabled: rec.enabled,
            patterns: rec.patterns.0,
            actions: rec.actions.0,
            timeout_duration_seconds: rec.timeout_duration_seconds,
            scope: rec.scope.0,
        })
        .collect();

    Ok(rulesets)
}
