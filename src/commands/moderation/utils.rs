use crate::types::{Context, Error};
use serenity::all::{Message, MessageId};

/// Parses duration and yells at the user if they format it like a toddler.
pub async fn parse_duration(
    ctx: &Context<'_>,
    duration: &str,
) -> Result<Option<std::time::Duration>, Error> {
    match duration_str::parse_std(duration) {
        Ok(dur) => Ok(Some(dur)),
        Err(_) => {
            send_ephemeral(
                ctx,
                "Invalid duration format. Please use formats like '30m', '2h', or '1d'.",
            )
                .await?;
            Ok(None) // Returning Ok(None) lets the command exit gracefully
        }
    }
}

/// Sends a simple ephemeral reply back to the user.
pub async fn send_ephemeral(ctx: &Context<'_>, message: impl Into<String>) -> Result<(), Error> {
    ctx.send(
        poise::CreateReply::default()
            .content(message)
            .ephemeral(true),
    )
        .await?;
    Ok(())
}

pub fn get_to_be_deleted_message_ids(messages: &Vec<Message>) -> Vec<MessageId> {
    let now = serenity::model::Timestamp::now();

    messages
        .iter()
        .filter(|m| {
            let age = now.unix_timestamp() - m.timestamp.unix_timestamp();
            age < (14 * 24 * 60 * 60) - 60
        })
        .map(|m| m.id)
        .collect()
}