use crate::core::config::settings::{get_settings, save_settings};
use crate::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{GuildChannel, Role};
use crate::features::automod::HoneypotConfig;

type Context<'a> = poise::Context<'a, Data, Error>;

/// Parent command group for Honeypot management
#[poise::command(
    slash_command,
    subcommands("set", "disable"),
    guild_only,
    required_permissions = "MANAGE_GUILD"
)]
pub async fn honeypot(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Set or update honeypot configuration options
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn set(
    ctx: Context<'_>,
    #[description = "The channel to use as a honeypot"] channel: Option<GuildChannel>,
    #[description = "Enable or disable the honeypot"] enabled: Option<bool>,
    #[description = "Reason for ban when caught in honeypot"] reason: Option<String>,
    #[description = "Delete message days upon ban (0-7)"] dmd: Option<u8>,
    #[description = "Temp ban duration (e.g., '1d', '12h', or in milliseconds)"] duration: Option<String>,
    #[description = "Exempt role to add to exemptions"] exempt_role: Option<Role>,
) -> Result<(), Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or_else(|| anyhow::anyhow!("Command must be used inside a server."))?;

    let data = ctx.data();

    // Fetch existing guild settings
    let mut settings =
        get_settings(&data.db, &data.redis, &data.guild_configs, guild_id.get() as i64).await?;

    // Get or initialize HoneypotConfig
    let mut honeypot = settings.honeypot.unwrap_or_else(|| HoneypotConfig {
        enabled: Some(true),
        channel_id: None,
        exempt_roles: None,
        dmd: Some(0),
        reason: None,
        duration: None,
    });

    // Track modified options for feedback message
    let mut changes = Vec::new();

    if let Some(ch) = channel {
        honeypot.channel_id = Some(ch.id.get());
        changes.push(format!("Channel: <#{}>", ch.id));
    }

    if let Some(en) = enabled {
        honeypot.enabled = Some(en);
        changes.push(format!("Enabled: `{}`", en));
    }

    if let Some(r) = reason {
        honeypot.reason = Some(r.clone());
        changes.push(format!("Reason: `{}`", r));
    }

    if let Some(d) = dmd {
        let clamped_dmd = d.min(7); // Discord limit is 0 to 7 days
        honeypot.dmd = Some(clamped_dmd);
        changes.push(format!("Delete Message Days: `{}`", clamped_dmd));
    }

    if let Some(dur_str) = duration {
        if let Ok(parsed_dur) = humantime::parse_duration(&dur_str) {
            honeypot.duration = Some(parsed_dur.as_millis() as u64);
            changes.push(format!("Duration: `{}`", dur_str));
        } else if let Ok(ms) = dur_str.parse::<u64>() {
            honeypot.duration = Some(ms);
            changes.push(format!("Duration: `{}ms`", ms));
        } else {
            ctx.say("❌ Invalid duration format. Use standard units like `1d`, `12h`, `30m`.")
                .await?;
            return Ok(());
        }
    }

    if let Some(role) = exempt_role {
        let mut roles = honeypot.exempt_roles.unwrap_or_default();
        let role_id_str = role.id.get().to_string();

        if !roles.contains(&role_id_str) {
            roles.push(role_id_str);
            changes.push(format!("Added Exempt Role: <@&{}>", role.id));
        }
        honeypot.exempt_roles = Some(roles);
    }

    if changes.is_empty() {
        ctx.say("No settings were specified to update.").await?;
        return Ok(());
    }

    settings.honeypot = Some(honeypot);

    save_settings(
        &data.db,
        &data.redis,
        &data.guild_configs,
        guild_id.get() as i64,
        &settings,
    )
        .await?;

    ctx.say(format!("**Honeypot settings updated:**\n• {}", changes.join("\n• "))).await?;

    Ok(())
}

/// Quick helper command to disable the honeypot feature
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn disable(ctx: Context<'_>) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or_else(|| anyhow::anyhow!("Must be used in a server"))?;
    let data = ctx.data();

    let mut settings = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id.get() as i64).await?;

    if let Some(ref mut honeypot) = settings.honeypot {
        honeypot.enabled = Some(false);

        // Save updated settings
        save_settings(
            &data.db,
            &data.redis,
            &data.guild_configs,
            guild_id.get() as i64,
            &settings,
        )
            .await?;

        ctx.say("Honeypot has been disabled.").await?;
    } else {
        ctx.say("Honeypot is not configured.").await?;
    }

    Ok(())
}