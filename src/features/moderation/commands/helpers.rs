use crate::core::config::state::{Context, Error};
use crate::shared::messages;

/// Parses duration and yells at the user if they format it like a toddler.
pub async fn parse_duration(
    ctx: &Context<'_>,
    duration: &str,
) -> Result<Option<std::time::Duration>, Error> {
    if let Ok(dur) = duration_str::parse_std(duration) {
        Ok(Some(dur))
    } else {
        messages::send_ephemeral(
            ctx,
            "Invalid duration format. Please use formats like '30m', '2h', or '1d'.",
        )
        .await?;
        Ok(None) // Returning Ok(None) lets the command exit gracefully
    }
}
