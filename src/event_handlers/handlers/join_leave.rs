use crate::{Data, Error, utils::config::get_settings};
use poise::serenity_prelude as serenity;
use serenity::{ChannelId, CreateEmbed, CreateMessage, Mentionable};

pub async fn on_member_join(
    ctx: &serenity::Context,
    member: &serenity::Member,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = member.guild_id.get() as i64;

    // Load dynamic settings (JSONB)
    let settings = get_settings(&data.db, guild_id).await?;

    // 1. Assign auto-role if configured
    if let Some(role_id_i64) = settings.join_role_id {
        let role_id = serenity::RoleId::new(role_id_i64 as u64);
        if let Err(e) = member.add_role(&ctx.http, role_id).await {
            eprintln!("Failed to add join role to {}: {}", member.user.name, e);
        }
    }

    // 2. Send Welcome Message with integrated alt warning
    if let Some(channel_id_i64) = settings.welcome_channel_id {
        let channel_id = ChannelId::new(channel_id_i64 as u64);
        let warning_text = check_alt_status(&member.user);

        let embed = CreateEmbed::new()
            .title("New Member Joined!")
            .description(format!(
                "Welcome to the server, {}! We are glad to have you here.{}",
                member.user.mention(),
                warning_text
            ))
            .thumbnail(member.user.face())
            .color(serenity::Color::from_rgb(0, 255, 0))
            .footer(serenity::CreateEmbedFooter::new(format!(
                "User ID: {}",
                member.user.id
            )));

        let builder = CreateMessage::new().embed(embed);
        let _ = channel_id.send_message(&ctx.http, builder).await;
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
    let settings = get_settings(&data.db, guild_id).await?;

    // 1. Send departure message to logs if channel is configured
    if let Some(log_channel_i64) = settings.leave_channel_id {
        let channel_id = ChannelId::new(log_channel_i64 as u64);
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
