use crate::{core::config::state::BotData, features::verification::generate_verification_link};
use poise::serenity_prelude as serenity;
use tracing::warn;

pub async fn send_verification_link(
    ctx: &serenity::prelude::Context,
    data: &BotData,
    component: &serenity::ComponentInteraction,
) -> Result<(), anyhow::Error> {
    let Some(guild_id) = component.guild_id else {
        return Ok(());
    };
    let Some(shared_secret) = data.core.config.shared_secret.as_deref() else {
        warn!("Shared secret not set up for verification");
        return Ok(());
    };
    let verification_link = generate_verification_link(
        component.user.id.get(),
        guild_id.get(),
        shared_secret.as_bytes(),
        data.core.config.domain.as_str(),
    );
    component
        .create_response(
            &ctx.http,
            serenity::CreateInteractionResponse::Message(
                serenity::CreateInteractionResponseMessage::new()
                    .content(format!(
                        "Please go to this link to verify: {verification_link}"
                    ))
                    .ephemeral(true),
            ),
        )
        .await?;

    Ok(())
}
