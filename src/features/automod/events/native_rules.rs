use crate::core::config::state::{BotData, Error};
use crate::features::automod::cache::get_rule_name;
use crate::features::automod::insert_automod_row;
use crate::features::automod::types::LoggedAction;
use serenity::all::{ActionExecution, Context};

pub async fn store_automod(ctx: &Context, execution: &ActionExecution, data: &BotData) -> Result<(), Error> {
    let db = &data.core.db;
    let redis = &data.core.redis;

    let action = LoggedAction::from(&execution.action).as_str().to_ascii_uppercase();
    let rule_name = get_rule_name(&ctx, redis, &execution.guild_id, &execution.rule_id).await;

    insert_automod_row(
        db,
        execution.guild_id.get() as i64,
        execution.user_id.get() as i64,
        execution.channel_id.map(|v| v.get() as i64),
        execution.message_id.map(|v| v.get() as i64),
        &rule_name,
        execution.matched_content.as_deref(),
        Some(execution.content.as_str()),
        &[&action],
        "asdf",
    ).await?;

    Ok(())
}

