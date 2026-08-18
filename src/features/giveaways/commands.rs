#![allow(clippy::unused_async)]
use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::giveaways::database::{create_giveaway, update_giveaway_message_id};
use crate::shared::messages::send_ephemeral;
use anyhow::Context as _;
use chrono::Utc;
use rand::seq::IndexedRandom;
use serenity::all::{ChannelId, CreateEmbed, CreateMessage, ReactionType};

/// Parent command for giveaway operations
#[poise::command(
    slash_command,
    default_member_permissions = "MANAGE_GUILD",
    guild_only,
    subcommands("create", "reroll")
)]
pub async fn giveaway(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Start a quick giveaway
#[poise::command(slash_command)]
pub async fn create(
    ctx: Context<'_>,
    #[description = "Duration (e.g. 30m, 2h, 1d)"] duration: String,
    #[description = "The prize being given away"] prize: String,
    #[description = "Number of winners (default: 1)"] winners: Option<i32>,
    #[description = "Channel to host in (defaults to current)"] channel: Option<ChannelId>,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    // Parse duration (using humantime crate)
    let Ok(parsed_duration) = humantime::parse_duration(&duration) else {
        send_ephemeral(
            &ctx,
            "Invalid duration format! Example formats: `30m`, `2h`, `1d`",
        )
        .await?;
        return Ok(());
    };

    let winner_count = winners.unwrap_or(1).max(1);
    let target_channel = channel.unwrap_or_else(|| ctx.channel_id());
    let host_id = ctx.author().id;

    let end_time = Utc::now() + chrono::Duration::from_std(parsed_duration)?;
    let timestamp = end_time.timestamp();

    // Insert into DB
    let giveaway_id = create_giveaway(
        &ctx.data().core.db,
        guild_id,
        host_id,
        target_channel,
        &prize,
        winner_count,
        end_time,
    )
    .await?;

    let embed = CreateEmbed::new()
        .title(format!("🎉 GIVEAWAY: {prize}"))
        .description(format!(
            "React with 🎉 to enter!\n\n**Ends:** <t:{timestamp}:R> (<t:{timestamp}:f>)\n**Winners:** {winner_count}\n**Hosted by:** <@{host_id}>"
        ))
        .color(BRAND_COLOR);

    let msg = target_channel
        .send_message(
            &ctx.serenity_context().http,
            CreateMessage::new().embed(embed),
        )
        .await?;

    msg.react(
        &ctx.serenity_context().http,
        ReactionType::Unicode("🎉".to_string()),
    )
    .await?;

    update_giveaway_message_id(&ctx.data().core.db, giveaway_id, msg.id).await?;
    send_ephemeral(
        &ctx,
        format!("Giveaway **#{giveaway_id}** created in <#{target_channel}>!"),
    )
    .await?;

    Ok(())
}

/// Reroll a winner for a finished giveaway
#[poise::command(slash_command)]
pub async fn reroll(
    ctx: Context<'_>,
    #[description = "The Message ID of the giveaway message"] message_id: u64,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let channel_id = ctx.channel_id();
    let reaction = ReactionType::Unicode("🎉".to_string());

    let users = ctx
        .serenity_context()
        .http
        .get_reaction_users(
            channel_id,
            serenity::all::MessageId::new(message_id),
            &reaction,
            100, // reroll bullshit
            None,
        )
        .await?;

    let eligible_users: Vec<_> = users.into_iter().filter(|u| !u.bot).map(|u| u.id).collect();

    if eligible_users.is_empty() {
        send_ephemeral(&ctx, "No eligible entries found for reroll.").await?;
        return Ok(());
    }

    let chosen_winner = {
        let mut rng = rand::rng();
        eligible_users.choose(&mut rng).copied()
    };

    if let Some(new_winner) = chosen_winner {
        ctx.channel_id()
            .say(
                &ctx.serenity_context().http,
                format!("🎉 **REROLL!** Congratulations <@{new_winner}>, you are the new winner!"),
            )
            .await?;

        send_ephemeral(&ctx, "Successfully rerolled a new winner!").await?;
    }

    Ok(())
}
