use crate::core::config::get_settings;
use crate::types::FlagSeverity;
use crate::types::{Context, Error};
use poise::serenity_prelude as serenity;
use redis::AsyncCommands;
use serenity::all::{GuildChannel, Role}; // Added import for Redis commands
use strum::EnumMessage; // Add this import

#[derive(
    poise::ChoiceParameter, strum::Display, strum::EnumMessage, Clone, Copy, Debug, Eq, PartialEq,
)]
pub enum ConfigField {
    #[strum(serialize = "welcome_channel_id", message = "Welcome Channel")]
    WelcomeChannel,
    #[strum(serialize = "message_log_channel_id", message = "Message Log Channel")]
    MessageLogChannel,
    #[strum(serialize = "join_role_id", message = "Join Role")]
    JoinRole,
    #[strum(serialize = "leave_channel_id", message = "Leave Channel")]
    LeaveChannel,
    #[strum(serialize = "general_bot_logs_id", message = "General Bot Logs")]
    GeneralBotLogs,
    #[strum(serialize = "message_filter_above", message = "Message Filter Above")]
    MessageFilterAbove,
    #[strum(serialize = "ticket_category_id", message = "Ticket Category")]
    TicketCategory,
    #[strum(serialize = "ticket_role_id", message = "Ticket Role")]
    TicketRole,
}

#[poise::command(
    slash_command,
    required_permissions = "MANAGE_GUILD",
    guild_only,
    subcommands("set", "unset", "show")
)]
pub async fn config(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Set one or multiple configuration settings for this server
#[poise::command(slash_command)]
async fn set(
    ctx: Context<'_>,
    #[description = "The target channel for welcomes"] welcome_channel: Option<serenity::Channel>,
    #[description = "The target channel for message logs (deletes/edits)"]
    message_log_channel: Option<serenity::Channel>,
    #[description = "The role assigned to new members"] join_role: Option<Role>,
    #[description = "The target channel for leave logs"] leave_channel: Option<serenity::Channel>,
    #[description = "The target channel for general bot and mod logs"] bot_log_channel: Option<
        serenity::Channel,
    >,
    #[description = "The severity (and higher) to delete"] filter_above: Option<FlagSeverity>,
    #[description = "The category for ticket creation"]
    #[channel_types("Category")]
    ticket_category: Option<GuildChannel>,
    #[description = "The role for ticket access"] ticket_role: Option<Role>,
) -> Result<(), Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or("This command must be executed within a server.")?
        .get() as i64;
    let db = &ctx.data().db;

    // 1. Process optional inputs to retrieve database patches and confirmation messages
    let Some((patch, changes_text)) = process_set_params(
        &welcome_channel,
        &message_log_channel,
        &join_role,
        &leave_channel,
        &bot_log_channel,
        &filter_above,
        &ticket_category,
        &ticket_role,
    )?
    else {
        ctx.say("Please specify at least one setting to configure.")
            .await?;
        return Ok(());
    };

    sqlx::query!(
        r#"
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, $2)
        ON CONFLICT (guild_id)
        DO UPDATE SET settings = guild_configs.settings || EXCLUDED.settings
        "#,
        guild_id,
        patch
    )
    .execute(db)
    .await?;

    // 2. Invalidate the Redis configuration cache
    invalidate_config_cache(&ctx.data().redis, guild_id).await;

    ctx.say(format!("Updated server configuration:\n{}", changes_text))
        .await?;
    Ok(())
}

/// Unsets (clears) a configuration option, disabling that feature

#[poise::command(slash_command)]
async fn unset(
    ctx: Context<'_>,
    #[description = "The configuration option to clear"] option: ConfigField,
) -> Result<(), Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or("This command must be executed within a server.")?
        .get() as i64;
    let db = &ctx.data().db;

    // 1. Strum automatically derives the DB key from 'serialize' and the UI label from 'message'
    let json_key = option.to_string(); // E.g., "welcome_channel_id"
    let label = option.get_message().unwrap_or("Unknown Field"); // E.g., "Welcome Channel"

    sqlx::query!(
        "UPDATE guild_configs SET settings = settings - $2 WHERE guild_id = $1",
        guild_id,
        json_key
    )
    .execute(db)
    .await?;

    invalidate_config_cache(&ctx.data().redis, guild_id).await;

    ctx.say(format!("Successfully cleared/disabled **{}**.", label))
        .await?;
    Ok(())
}

fn format_opt<T, F>(opt: Option<T>, formatter: F) -> String
where
    F: FnOnce(T) -> String,
{
    opt.map_or_else(|| "*Not configured*".to_string(), formatter)
}

/// Displays the current active configuration for this server
#[poise::command(slash_command)]
async fn show(ctx: Context<'_>) -> Result<(), Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or("This command must be executed within a server.")?
        .get() as i64;
    let db = &ctx.data().db;
    let redis = &ctx.data().redis;

    let config = get_settings(db, redis, guild_id).await?;

    let welcome = format_opt(config.welcome_channel_id, |id| format!("<#{id}>"));
    let logs = format_opt(config.message_log_channel_id, |id| format!("<#{id}>"));
    let role = format_opt(config.join_role_id, |id| format!("<@&{id}>"));
    let leave = format_opt(config.leave_channel_id, |id| format!("<#{id}>"));
    let bot_logs = format_opt(config.general_bot_logs_id, |id| format!("<#{id}>"));
    let ticket_category = format_opt(config.ticket_category_id, |id| format!("<#{id}>"));
    let ticket_role = format_opt(config.ticket_role_id, |id| format!("<@&{id}>"));
    let filter = format_opt(config.message_filter_above, |f| format!("**{}**", f.name()));

    let embed_content = format!(
        "**Welcome Channel**: {}\n\
        **Message Log Channel**: {}\n\
        **Join Role**: {}\n\
        **Leave Channel**: {}\n\
        **General Bot Logs**: {}\n\
        **Message Filter Above**: {}\n\
        **Ticket Category**: {}\n\
        **Moderator Role: {}",
        welcome, logs, role, leave, bot_logs, filter, ticket_category, ticket_role,
    );

    ctx.send(
        poise::CreateReply::default().embed(
            serenity::CreateEmbed::default()
                .title("Server Configuration")
                .description(embed_content)
                .color(0x5865F2),
        ),
    )
    .await?;

    Ok(())
}

macro_rules! patch_id {
    ($patch:expr, $changes:expr, $option:expr, $id_expr:expr, $db_key:expr, $label:expr, $format_str:expr) => {
        if let Some(val) = $option {
            let id = $id_expr(val);
            $patch.insert($db_key.into(), id.into());
            $changes.push(format!("- **{}**: {}", $label, format!($format_str, id)));
        }
    };
}

/// Helper function to construct a JSONB patch and compile the user changelog message.
/// Returns `None` if no options were configured.
fn process_set_params(
    welcome_channel: &Option<serenity::Channel>,
    log_channel: &Option<serenity::Channel>,
    join_role: &Option<Role>,
    leave_channel: &Option<serenity::Channel>,
    bot_log_channel: &Option<serenity::Channel>,
    filter_above: &Option<FlagSeverity>,
    ticket_category: &Option<GuildChannel>,
    ticket_role: &Option<Role>,
) -> Result<Option<(serde_json::Value, String)>, Error> {
    let mut patch = serde_json::Map::new();
    let mut changes = Vec::new();

    // Use our macro to build the fields cleanly in 1 line
    patch_id!(
        patch,
        changes,
        welcome_channel,
        |c: &serenity::Channel| c.id().get(),
        "welcome_channel_id",
        "Welcome Channel",
        "<#{}>"
    );
    patch_id!(
        patch,
        changes,
        log_channel,
        |c: &serenity::Channel| c.id().get(),
        "message_log_channel_id",
        "Message Log Channel",
        "<#{}>"
    );
    patch_id!(
        patch,
        changes,
        join_role,
        |r: &Role| r.id.get(),
        "join_role_id",
        "Join Role",
        "**{}**"
    );
    patch_id!(
        patch,
        changes,
        ticket_role,
        |r: &Role| r.id.get(),
        "ticket_role_id",
        "Ticket Role",
        "**{}**"
    );
    patch_id!(
        patch,
        changes,
        leave_channel,
        |c: &serenity::Channel| c.id().get(),
        "leave_channel_id",
        "Leave Channel",
        "<#{}>"
    );
    patch_id!(
        patch,
        changes,
        bot_log_channel,
        |c: &serenity::Channel| c.id().get(),
        "general_bot_logs_id",
        "General Bot Logs",
        "<#{}>"
    );
    patch_id!(
        patch,
        changes,
        ticket_category,
        |c: &GuildChannel| c.id.get(),
        "ticket_category_id",
        "Ticket Category",
        "<#{}>"
    );

    // Non-ID fields can still be handled normally
    if let Some(f) = filter_above {
        let val = serde_json::to_value(f)?;
        patch.insert("message_filter_above".into(), val);
        changes.push(format!("- **Filter Above**: **{}**", f.name()));
    }

    if patch.is_empty() {
        Ok(None)
    } else {
        Ok(Some((serde_json::Value::Object(patch), changes.join("\n"))))
    }
}
/// Private helper to remove the cached settings of a guild from Redis.
/// Silent failure ensures the parent command never breaks if Redis is temporarily offline.
async fn invalidate_config_cache(redis: &redis::Client, guild_id: i64) {
    let cache_key = format!("config:guild:{}", guild_id);
    if let Ok(mut conn) = redis.get_multiplexed_async_connection().await {
        let _: Result<(), _> = conn.del(&cache_key).await;
    }
}
