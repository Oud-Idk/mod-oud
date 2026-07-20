use crate::types::{Context, Error};
use crate::utils::verification::generate_verification_link;
use std::env;
use tracing::debug;

#[poise::command(slash_command, guild_only)]
pub async fn test_verif(ctx: Context<'_>) -> Result<(), Error> {
    let user = ctx.author();
    let secret_key = env::var("VERIFICATION_SECRET")?;
    let domain = env::var("DOMAIN")?;
    let link = generate_verification_link(
        user.id.get(), ctx.guild_id().unwrap().get(), secret_key.as_bytes(), &domain,
    );

    debug!("Sending URL {}", link);
    ctx.say(link).await?;

    Ok(())
}