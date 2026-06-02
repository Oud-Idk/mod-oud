use crate::{
    Context, Error,
    utils::{
        config::get_settings,
        logger::FlagSeverity,
    },
};
use poise::{serenity_prelude as serenity};
use serenity::all::{GuildChannel, Role};

#[derive(poise::ChoiceParameter, Clone, Copy, Debug, Eq, PartialEq)]
#[allow(dead_code)]
pub enum ConfigField {
    #[name = "Welcome Channel"]
    WelcomeChannel,
    #[name = "Message Log Channel"]
    MessageLogChannel,
    #[name = "Join Role"]
    JoinRole,
    #[name = "Leave Channel"]
    LeaveChannel,
    #[name = "General Bot Logs"]
    GeneralBotLogs,
    #[name = "Filter Above"]
    MessageFilterAbove,
    #[name = "Ticket Category"]
    TicketCategory,
    #[name = "Ticket Role"]
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
    #[description = "The target channel for message logs (deletes/edits)"] log_channel: Option<serenity::Channel>,
    #[description = "The role assigned to new members"] join_role: Option<Role>,
    #[description = "The target channel for leave logs"] leave_channel: Option<serenity::Channel>,
    #[description = "The target channel for general bot and mod logs"] bot_log_channel: Option<serenity::Channel>,
    #[description = "The severity (and higher) to delete"] filter_above: Option<FlagSeverity>,
    #[description = "The category for ticket creation"]
    #[channel_types("Category")]
    ticket_category: Option<GuildChannel>,
    #[description = "The role for ticket access"]
    ticket_role: Option<Role>,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("This command must be executed within a server.")?.get() as i64;
    let db = &ctx.data().db;

    // 1. Process optional inputs to retrieve database patches and confirmation messages
    let Some((patch, changes_text)) = process_set_params(
        &welcome_channel,
        &log_channel,
        &join_role,
        &leave_channel,
        &bot_log_channel,
        &filter_above,
        &ticket_category,
        &ticket_role,
    )? else {
        ctx.say("Please specify at least one setting to configure.").await?;
        return Ok(());
    };

    // 2. Perform dynamic JSONB merge-patch operation
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

    ctx.say(format!("Updated server configuration:\n{}", changes_text)).await?;
    Ok(())
}

/// Unsets (clears) a configuration option, disabling that feature
#[poise::command(slash_command)]
async fn unset(
    ctx: Context<'_>,
    #[description = "The configuration option to clear"] option: ConfigField,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("This command must be executed within a server.")?.get() as i64;
    let db = &ctx.data().db;

    let (json_key, label) = match option {
        ConfigField::WelcomeChannel => ("welcome_channel_id", "Welcome Channel"),
        ConfigField::MessageLogChannel => ("message_log_channel_id", "Message Log Channel"),
        ConfigField::JoinRole => ("join_role_id", "Join Role"),
        ConfigField::LeaveChannel => ("leave_channel_id", "Leave Channel"),
        ConfigField::GeneralBotLogs => ("general_bot_logs_id", "General Bot Logs"),
        ConfigField::MessageFilterAbove => ("message_filter_above", "Message Filter Above"),
        ConfigField::TicketCategory => ("ticket_category_id", "Ticket Category"),
        ConfigField::TicketRole => ("ticket_role_id", "Ticket Role"),
    };

    sqlx::query!(
        "UPDATE guild_configs SET settings = settings - $2 WHERE guild_id = $1",
        guild_id,
        json_key
    )
        .execute(db)
        .await?;

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
    let guild_id = ctx.guild_id().ok_or("This command must be executed within a server.")?.get() as i64;
    let db = &ctx.data().db;

    let config = get_settings(db, guild_id).await?;

    let welcome = format_opt(config.welcome_channel_id, |id| format!("<#{id}>"));
    let logs = format_opt(config.message_log_channel_id, |id| format!("<#{id}>"));
    let role = format_opt(config.join_role_id, |id| format!("<@&{id}>"));
    let leave = format_opt(config.leave_channel_id, |id| format!("<#{id}>"));
    let bot_logs = format_opt(config.general_bot_logs_id, |id| format!("<#{id}>"));
    let ticket_category = format_opt(config.ticket_category_id, |id| format!("<#{id}>"));
    let filter = format_opt(config.message_filter_above, |f| format!("**{}**", f.name()));

    let embed_content = format!(
        "**Welcome Channel**: {}\n\
        **Message Log Channel**: {}\n\
        **Join Role**: {}\n\
        **Leave Channel**: {}\n\
        **General Bot Logs**: {}\n\
        **Message Filter Above**: {}\n\
        **Ticket Category**: {}",
        welcome, logs, role, leave, bot_logs, filter, ticket_category
    );

    ctx.send(
        poise::CreateReply::default()
            .embed(
                serenity::CreateEmbed::default()
                    .title("Server Configuration")
                    .description(embed_content)
                    .color(0x5865F2),
            )
    )
        .await?;

    Ok(())
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

    if let Some(c) = welcome_channel {
        patch.insert("welcome_channel_id".into(), c.id().get().into());
        changes.push(format!("- **Welcome Channel**: <#{}>", c.id()));
    }
    if let Some(c) = log_channel {
        patch.insert("message_log_channel_id".into(), c.id().get().into());
        changes.push(format!("- **Message Log Channel**: <#{}>", c.id()));
    }
    if let Some(r) = join_role {
        patch.insert("join_role_id".into(), r.id.get().into());
        changes.push(format!("- **Join Role**: **{}**", r.name));
    }
    if let Some(r) = ticket_role {
        patch.insert("ticket_role_id".into(), r.id.get().into());
        changes.push(format!("- **Ticket Role**: **{}**", r.name));
    }
    if let Some(c) = leave_channel {
        patch.insert("leave_channel_id".into(), c.id().get().into());
        changes.push(format!("- **Leave Channel**: <#{}>", c.id()));
    }
    if let Some(c) = bot_log_channel {
        patch.insert("general_bot_logs_id".into(), c.id().get().into());
        changes.push(format!("- **General Bot Logs**: <#{}>", c.id()));
    }
    if let Some(f) = filter_above {
        let val = serde_json::to_value(f)?;
        patch.insert("message_filter_above".into(), val);
        changes.push(format!("- **Filter Above**: **{}**", f.name()));
    }
    if let Some(c) = ticket_category {
        patch.insert("ticket_category_id".into(), c.id.get().into());
        changes.push(format!("- **Ticket Category**: <#{}>", c.id));
    }

    if patch.is_empty() {
        Ok(None)
    } else {
        Ok(Some((serde_json::Value::Object(patch), changes.join("\n"))))
    }
}
