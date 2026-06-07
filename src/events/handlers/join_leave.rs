use crate::core::config::{get_guild_ctx, get_settings, replace_placeholders};
use crate::types::config::WelcomeMessageSettings;
use crate::types::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::{ChannelId, CreateEmbed, CreateMessage, Mentionable};

pub async fn on_member_join(
    ctx: &serenity::Context,
    member: &serenity::all::Member,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = member.guild_id.get() as i64;
    let settings = get_settings(&data.db, &data.redis, guild_id).await?;

    if let Some(role_id_i64) = settings.join_role_id {
        let role_id = serenity::RoleId::new(role_id_i64.parse::<u64>()?);
        if let Err(e) = member.add_role(&ctx.http, role_id).await {
            eprintln!("Failed to add join role to {}: {}", member.user.name, e);
        }
    }

    if let Some(welcome_config) = settings.welcome {
        let warning_text = check_alt_status(&member.user);
        let gctx = get_guild_ctx(member, ctx).await?;

        let public_channel_id_str = welcome_config.public.as_ref().and_then(|p| p.channel_id.as_deref());
        if let Ok(context_channel) = get_context_channel(ctx, member, public_channel_id_str).await {
            if let Some(ref public_settings) = welcome_config.public {
                if public_settings.enabled.unwrap_or(false) {
                    if let Some(ref channel_id_str) = public_settings.channel_id {
                        if let Ok(ch_u64) = channel_id_str.parse::<u64>() {
                            let public_channel_id = serenity::all::ChannelId::new(ch_u64);

                            match build_welcome_message(public_settings, member, &context_channel, &gctx, &warning_text, false) {
                                Ok(builder) => {
                                    let _ = public_channel_id.send_message(&ctx.http, builder).await;
                                }
                                Err(e) => eprintln!("Failed to build public welcome message: {}", e),
                            }
                        }
                    }
                }
            }

            if let Some(ref private_settings) = welcome_config.private {
                if private_settings.enabled.unwrap_or(false) {
                    match member.user.create_dm_channel(&ctx.http).await {
                        Ok(private_channel) => {
                            match build_welcome_message(private_settings, member, &context_channel, &gctx, &warning_text, true) {
                                Ok(builder) => {
                                    let _ = private_channel.send_message(&ctx.http, builder).await;
                                }
                                Err(e) => eprintln!("Failed to build private welcome message: {}", e),
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to create DM channel for user {}: {}", member.user.name, e);
                        }
                    }
                }
            }
        }
    }

    // 3. Log join event in database
    let user_id = member.user.id.get() as i64;
    sqlx::query!(
        "INSERT INTO join_leave_logs (user_id, guild_id, action) VALUES ($1, $2, 'JOIN')",
        user_id,
        guild_id
    )
        .execute(&data.db)
        .await?;

    Ok(())
}

pub async fn on_member_leave(
    ctx: &serenity::Context,
    _guild_id: &serenity::GuildId,
    user: &serenity::User,
    member_data_if_available: &Option<serenity::Member>,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = _guild_id.get() as i64;

    // Load settings (JSONB)
    let settings = get_settings(&data.db, &data.redis, guild_id).await?;

    // 1. Send departure message to logs if channel is configured
    if let Some(log_channel_i64) = settings.leave_channel_id {
        let channel_id = ChannelId::new(log_channel_i64.parse::<u64>()?);
        let roles_text = format_member_roles(member_data_if_available);

        let embed = CreateEmbed::new()
            .title("Member Left / Kicked")
            .description(format!(
                "**{}** (`{}`) is no longer in the server.",
                user.name, user.id
            ))
            .field("Roles before leaving", roles_text, false)
            .thumbnail(user.face())
            .color(serenity::Color::from_rgb(255, 0, 0))
            .timestamp(serenity::Timestamp::now());

        let builder = CreateMessage::new().embed(embed);
        let _ = channel_id.send_message(&ctx.http, builder).await;
    }

    // 2. Log leave event to database
    let user_id = user.id.get() as i64;
    sqlx::query!(
        "INSERT INTO join_leave_logs (user_id, guild_id, action) VALUES ($1, $2, 'LEAVE')",
        user_id,
        guild_id
    )
        .execute(&data.db)
        .await?;

    Ok(())
}

/// Helper to compile the plaintext content or parsed embed payload for a welcome configuration
fn build_welcome_message(
    settings: &WelcomeMessageSettings,
    member: &serenity::all::Member,
    channel: &serenity::all::GuildChannel,
    gctx: &crate::core::config::GuildCtx,
    warning_text: &str,
    is_dm: bool,
) -> Result<CreateMessage, Error> {
    let mut builder = CreateMessage::new();
    let mut has_payload = false;

    let format = settings.format.as_deref().unwrap_or("embed");

    // Plaintext format option
    if format == "text" {
        if let Some(ref text_template) = settings.content {
            let parsed_content = replace_placeholders(
                text_template,
                gctx,
                member,
                channel,
                None,
                Some(warning_text),
            );
            builder = builder.content(parsed_content);
            has_payload = true;
        }
    }

    // Rich embed format option
    if format == "embed" {
        if let Some(ref custom_embed_template) = settings.embed {
            if !custom_embed_template.is_empty() {
                let embed = custom_embed_template.to_create_embed_with_ctx(
                    member,
                    channel,
                    gctx,
                    None,
                    Some(warning_text),
                )?;
                builder = builder.embed(embed);
                has_payload = true;
            }
        }
    }

    // Standard fallback string if both options are unpopulated
    if !has_payload {
        let base_msg = if is_dm {
            format!(
                "Welcome to the server, {}! We are glad to have you here.",
                member.user.mention()
            )
        } else {
            format!(
                "Welcome to the server, {}! We are glad to have you here.{}",
                member.user.mention(),
                warning_text
            )
        };
        builder = builder.content(base_msg);
    }

    Ok(builder)
}

/// Helper to safely resolve a text channel to populate the placeholder evaluation context.
/// Defaults to the configured welcome channel, or falls back to any visible text channel.
async fn get_context_channel(
    ctx: &serenity::Context,
    member: &serenity::all::Member,
    public_channel_id_str: Option<&str>,
) -> Result<serenity::all::GuildChannel, Error> {
    if let Some(ch_str) = public_channel_id_str {
        if let Ok(id_u64) = ch_str.parse::<u64>() {
            let channel_id = ChannelId::new(id_u64);
            if let Ok(channel) = channel_id.to_channel(ctx).await {
                if let Some(guild_ch) = channel.guild() {
                    return Ok(guild_ch);
                }
            }
        }
    }

    // Fallback search using ChannelType enum to locate any standard guild text channel
    let channels = member.guild_id.channels(&ctx.http).await?;
    for (_, channel) in channels {
        if channel.kind == serenity::all::ChannelType::Text {
            return Ok(channel);
        }
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::Other,
        "Could not resolve a suitable text channel context.",
    )
        .into())
}

/// Checks the creation date of an account and returns a warning string if it is newer than 3 days.
fn check_alt_status(user: &serenity::User) -> String {
    let created_timestamp = user.id.created_at().unix_timestamp();
    let now_timestamp = serenity::Timestamp::now().unix_timestamp();
    let age_in_days = (now_timestamp - created_timestamp) / 86400;

    if age_in_days < 3 {
        format!(
            "\n\n⚠️ **WARNING:** This account is very new! Created {} days ago.",
            age_in_days
        )
    } else {
        String::new()
    }
}

/// Resolves a member's role list to a comma-separated mention string.
fn format_member_roles(member_data: &Option<serenity::Member>) -> String {
    let Some(member) = member_data else {
        return "Unknown (User was not in bot cache)".to_string();
    };

    if member.roles.is_empty() {
        "None".to_string()
    } else {
        member
            .roles
            .iter()
            .map(|role_id| role_id.mention().to_string())
            .collect::<Vec<String>>()
            .join(", ")
    }
}