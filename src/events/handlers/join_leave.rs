use crate::core::config::{get_guild_ctx, get_settings, replace_placeholders};
use crate::types::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::{ChannelId, CreateEmbed, CreateMessage, Mentionable};

pub async fn on_member_join(
    ctx: &serenity::Context,
    member: &serenity::all::Member,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = member.guild_id.get() as i64;

    // Load dynamic settings (JSONB)
    let settings = get_settings(&data.db, &data.redis, guild_id).await?;

    // 1. Assign auto-role if configured
    if let Some(role_id_i64) = settings.join_role_id {
        let role_id = serenity::RoleId::new(role_id_i64.parse::<u64>()?);
        if let Err(e) = member.add_role(&ctx.http, role_id).await {
            eprintln!("Failed to add join role to {}: {}", member.user.name, e);
        }
    }

    // 2. Send Welcome Message with integrated alt warning
    if let Some(welcome_settings) = settings.welcome {
        // ── RESPECT THE TOGGLE: Check if the feature is explicitly enabled ──
        if welcome_settings.enabled.unwrap_or(false) {
            if let Some(channel_id_i64) = welcome_settings.channel_id {
                let channel_id = serenity::all::ChannelId::new(channel_id_i64.parse::<u64>()?);
                let warning_text = check_alt_status(&member.user);

                // Fetch the GuildChannel object to fulfill the template context
                let channel = channel_id
                    .to_channel(ctx)
                    .await?
                    .guild()
                    .ok_or_else(|| {
                        std::io::Error::new(std::io::ErrorKind::Other, "Target channel is not a guild text channel")
                    })?;

                // Fetch GuildCtx ONCE to share between plain-text & embed builders
                let gctx = get_guild_ctx(member, ctx).await?;

                let mut builder = serenity::all::CreateMessage::new();
                let mut has_payload = false;

                let format = welcome_settings.format.as_deref().unwrap_or("embed");

                // Handle plain-text content mode
                if format == "text" {
                    if let Some(ref text_template) = welcome_settings.content {
                        let parsed_content = replace_placeholders(
                            text_template,
                            &gctx,
                            member,
                            &channel,
                            None,
                            Some(&warning_text),
                        );
                        builder = builder.content(parsed_content);
                        has_payload = true;
                    }
                }

                // Handle rich embed mode (only if the active format is "embed" and the embed is populated)
                if format == "embed" {
                    if let Some(ref custom_embed_template) = welcome_settings.embed {
                        if !custom_embed_template.is_empty() {
                            let embed = custom_embed_template
                                .to_create_embed_with_ctx(
                                    member,
                                    &channel,
                                    &gctx,
                                    None,
                                    Some(&warning_text),
                                )?;
                            builder = builder.embed(embed);
                            has_payload = true;
                        }
                    }
                }

                // Fallback to default layouts if both fields are entirely omitted in DB
                if !has_payload {
                    builder = builder.content(format!(
                        "Welcome to the server, {}! We are glad to have you here.{}",
                        member.user.mention(),
                        warning_text
                    ));
                }

                let _ = channel_id.send_message(&ctx.http, builder).await;
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
