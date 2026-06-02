use crate::commands::config::ConfigField;
use crate::utils::logger::FlagSeverity;
use crate::{Context, Error};
use poise::serenity_prelude as serenity;
use serde::{Deserialize, Serialize};

// ============================================================================
//  HOW TO ADD A NEW CONFIGURATION FIELD (JSONB MODEL)
// ============================================================================
//  Because we use a JSONB database model, adding a configuration setting
//  requires ZERO database migrations. You only need to touch two files:
//
//  1. UPDATE THE STORAGE STRUCT (in `utils/config.rs`):
//     - Add the optional field to the `GuildSettings` struct.
//     - Add `#[serde(skip_serializing_if = "Option::is_none")]` above it.
//     - Example:
//       ```rust
//       #[serde(skip_serializing_if = "Option::is_none")]
//       pub mute_log_channel_id: Option<i64>,
//       ```
//
//  2. ADD TO THE '/config set' ARGUMENTS (in `commands/config.rs`):
//     - Add the field as an `Option<T>` to the `set` slash command parameter list.
//     - Example:
//       ```rust
//       #[description = "The channel for mute logs"] mute_log_channel: Option<serenity::Channel>,
//       ```
//     - Pass this new variable into the `process_set_params` helper call inside `set`.
//
//  3. ADD TO THE RESOLVER HELPER (in `commands/config.rs` -> `process_set_params`):
//     - Update the helper function signature to accept your new parameter reference.
//     - Add an `if let Some` block to insert the value into the JSON patch map and
//       add a formatted description to the `changes` list.
//     - Example:
//       ```rust
//       if let Some(c) = mute_log_channel {
//           patch.insert("mute_log_channel_id".into(), c.id().get().into());
//           changes.push(format!("- **Mute Log Channel**: <#{}>", c.id()));
//       }
//       ```
//
//  4. ADD TO THE '/config unset' OPTION (Optional - in `commands/config.rs`):
//     - Add a variant for your field to the `ConfigField` enum.
//     - Map that enum variant to the JSON key and label inside the `unset` match block.
//     - Example:
//       ```rust
//       ConfigField::MuteLogChannel => ("mute_log_channel_id", "Mute Log Channel"),
//       ```
//
//  5. ADD TO THE '/config show' DISPLAY (in `commands/config.rs`):
//     - Pull the setting out of the `config` struct in `/config show`.
//     - Append it to the formatted `embed_content` block.
//     - Example:
//       ```rust
//       let mute = config.mute_log_channel_id.map_or("*Not configured*".to_string(), |id| format!("<#{id}>"));
//       ```
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GuildSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub welcome_channel_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_log_channel_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub join_role_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leave_channel_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub general_bot_logs_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_filter_above: Option<FlagSeverity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket_category_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket_role_id: Option<i64>,
}

/// Retrieves settings. Returns a default struct if none exists in the DB.
pub async fn get_settings(db: &sqlx::PgPool, guild_id: i64) -> Result<GuildSettings, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT settings FROM guild_configs WHERE guild_id = $1",
        guild_id
    )
    .fetch_optional(db)
    .await?;

    Ok(row
        .map(|r| serde_json::from_value(r.settings).unwrap_or_default())
        .unwrap_or_default())
}

#[poise::command(slash_command)]
async fn set(
    ctx: Context<'_>,
    welcome_channel: Option<serenity::Channel>,
    log_channel: Option<serenity::Channel>,
    join_role: Option<serenity::Role>,
    // To add a new setting parameter, just add it here as an Option
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("Not in a guild")?.get() as i64;
    let db = &ctx.data().db;

    // 1. Build a dynamic JSON patch of only the values the user specified
    let mut patch = serde_json::Map::new();
    if let Some(c) = &welcome_channel {
        patch.insert("welcome_channel_id".into(), c.id().get().into());
    }
    if let Some(c) = &log_channel {
        patch.insert("message_log_channel_id".into(), c.id().get().into());
    }
    if let Some(r) = &join_role {
        patch.insert("join_role_id".into(), r.id.get().into());
    }

    if patch.is_empty() {
        ctx.say("Specify at least one option.").await?;
        return Ok(());
    }

    // 2. Perform a JSON merge-patch in Postgres
    sqlx::query!(
        r#"
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, $2)
        ON CONFLICT (guild_id)
        DO UPDATE SET settings = guild_configs.settings || EXCLUDED.settings
        "#,
        guild_id,
        serde_json::Value::Object(patch)
    )
    .execute(db)
    .await?;

    ctx.say("Configuration updated!").await?;
    Ok(())
}

#[poise::command(slash_command)]
async fn unset(ctx: Context<'_>, option: ConfigField) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("Not in a guild")?.get() as i64;
    let db = &ctx.data().db;

    let json_key = match option {
        ConfigField::WelcomeChannel => "welcome_channel_id",
        ConfigField::MessageLogChannel => "message_log_channel_id",
        ConfigField::JoinRole => "join_role_id",
        ConfigField::LeaveChannel => "leave_channel_id",
        ConfigField::GeneralBotLogs => "general_bot_logs_id",
        ConfigField::MessageFilterAbove => "message_filter_above",
        ConfigField::TicketCategory => "ticket_category_id",
        ConfigField::TicketRole => "ticket_role_id",
    };

    // Use SQL to drop the key from the JSONB document
    sqlx::query!(
        "UPDATE guild_configs SET settings = settings - $2 WHERE guild_id = $1",
        guild_id,
        json_key
    )
    .execute(db)
    .await?;

    ctx.say("Cleared configuration field.".to_string()).await?;
    Ok(())
}
