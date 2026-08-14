use crate::core::config::state::Context;
use crate::shared::messages::send_ephemeral;
use crate::shared::voice_state::get_user_vc_in_guild;
use anyhow::{Context as _, Result};
use serenity::all::{CreateEmbed, CreateEmbedFooter, CreateMessage, Mentionable, User};
use crate::constants::BRAND_COLOR;

/// Send an invitation to your currently joined voice channel to the current channel.
#[poise::command(slash_command)]
pub async fn invite(
    ctx: Context<'_>,
    #[description = "The user to DM. Leave blank for current channel."] user: Option<User>,
    #[description = "Any message you want to say."] message: Option<String>,
) -> Result<()> {
    ctx.defer_ephemeral().await?;

    let guild_id = ctx.guild_id().with_context(|| "Not in guild")?;
    let author = ctx.author();
    let Some(vc_id) = get_user_vc_in_guild(ctx.data(), guild_id, author.id).await? else {
        send_ephemeral(&ctx, "Either you are not in a voice channel or it isn't registered in my system. Try rejoining.").await?;
        return Ok(());
    };

    let url = format!(
        "https://discord.com/channels/{}/{}",
        guild_id.get(),
        vc_id.get()
    );

    let msg = if let Some(message) = message {
        format!(
            "{} has invited you to join {}\n{}!",
            author.mention(),
            url,
            message
        )
    } else {
        format!("{} has invited you to join {}!", author.mention(), url)
    };

    let embed = CreateEmbed::new()
        .title("New Invitation!")
        .description(msg)
        .color(BRAND_COLOR)
        .footer(CreateEmbedFooter::new("Mod Oud"));

    let create_message = CreateMessage::new().embed(embed);

    match user {
        Some(u) => {
            u.dm(&ctx.http(), create_message).await?;
        }
        None => {
            ctx.channel_id().send_message(&ctx, create_message).await?;
        }
    }

    send_ephemeral(&ctx, "Invite has been sent!").await?;

    Ok(())
}
