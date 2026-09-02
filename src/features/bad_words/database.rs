use crate::features::automod::{RuleAction, RuleScope};
use crate::features::bad_words::types::{BadWordRuleset, Pattern};
use serenity::all::GuildId;
use sqlx::PgPool;
use sqlx::types::Json;

#[derive(sqlx::FromRow)]
struct RawBadWordRuleset {
    id: uuid::Uuid,
    guild_id: i64,
    name: String,
    enabled: bool,
    patterns: Json<Vec<Pattern>>,
    actions: Json<Vec<RuleAction>>,
    timeout_duration_seconds: Option<i32>,
    scope: Json<RuleScope>,
}

impl From<RawBadWordRuleset> for BadWordRuleset {
    fn from(r: RawBadWordRuleset) -> Self {
        Self {
            id: r.id,
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            name: r.name,
            enabled: r.enabled,
            patterns: r.patterns.0,
            actions: r.actions.0,
            timeout_duration_seconds: r.timeout_duration_seconds,
            scope: r.scope.0,
        }
    }
}

pub async fn fetch_bad_word_rows(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<BadWordRuleset>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawBadWordRuleset,
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

    Ok(rows.into_iter().map(Into::into).collect())
}
