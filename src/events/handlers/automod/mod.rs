pub mod types;
pub mod getters;
pub mod cache;

use crate::events::handlers::automod::getters::get_rule_name;
use crate::events::handlers::message_filter::database::insert_automod_log;
use crate::types::Data;
use serenity::all::{ActionExecution, Context};
use types::LoggedAction;

pub async fn on_automod(ctx: &Context, execution: &ActionExecution, data: &Data) -> Result<(), sqlx::Error> {
    let action = LoggedAction::from(&execution.action).as_str();
    let rule_name = get_rule_name(&ctx, &data.redis, &execution.guild_id, &execution.rule_id).await;

    insert_automod_log(
        &data.db,
        execution.guild_id.get() as i64,
        execution.user_id.get() as i64,
        execution.channel_id.map(|v| v.get() as i64).unwrap_or(0),
        execution.message_id.map(|v| v.get() as i64),
        &rule_name,
        execution.matched_content.as_deref(),
        Some(execution.content.as_str()),
        &[action],
    ).await?;

    Ok(())
}