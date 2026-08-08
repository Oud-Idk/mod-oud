use crate::Error;
use crate::shared::embed::build_custom_message;
use rand::prelude::IndexedRandom;
use serenity::all::{ChannelId, Http, Message};
use crate::core::config::settings::MessageLayout;

pub fn pick_payload(
    messages: &[MessageLayout],
    randomize: bool,
) -> Option<&MessageLayout> {
    if messages.is_empty() {
        return None;
    }

    if randomize {
        messages.choose(&mut rand::rng())
    } else {
        messages.first()
    }
}

pub async fn send_payload<F>(
    http: &Http,
    channel_id: ChannelId,
    payload: Option<&MessageLayout>,
    replace_fn: F,
) -> Result<Option<Message>, Error>
where
    F: Fn(&str) -> String,
{
    let Some(payload) = payload else {
        return Ok(None);
    };

    let message_builder = build_custom_message(
        payload.format,
        &payload.content,
        &payload.embed,
        replace_fn,
    )?;

    if let Some(builder) = message_builder {
        let msg = channel_id.send_message(http, builder).await?;
        Ok(Some(msg))
    } else {
        Ok(None)
    }
}