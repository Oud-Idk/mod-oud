use crate::types::{Data, Error};
use fred::interfaces::HashesInterface;
use serenity::all::{
    ActionRowComponent, ChannelId, CreateInteractionResponse,
    CreateInteractionResponseMessage, GuildId, ModalInteraction, UserId
};

async fn get_owned_temp_vc(
    data: &Data, guild_id: GuildId, user_id: UserId
) -> Result<Option<ChannelId>, Error> {
    let key = format!("temp_vc_owners:{}", guild_id);
    let field = user_id.get().to_string();

    let channel_id: Option<String> = data.redis.hget(&key, &field).await?;
    Ok(channel_id.and_then(|s| s.parse::<u64>().ok()).map(ChannelId::new))
}

pub async fn find_active_temp_vc(
    data: &Data,
    guild_id: Option<GuildId>,
    user_id: UserId,
) -> Result<Result<(ChannelId, GuildId), &'static str>, Error> {
    let Some(guild_id) = guild_id else {
        return Ok(Err("This can only be used in a server."));
    };

    match get_owned_temp_vc(data, guild_id, user_id).await? {
        Some(channel_id) => Ok(Ok((channel_id, guild_id))),
        None => Ok(Err("You don't currently have an active temp voice channel.")),
    }
}

pub fn create_ephemeral_msg(msg: &str) -> CreateInteractionResponse {
    CreateInteractionResponse::Message(
        CreateInteractionResponseMessage::new().content(msg).ephemeral(true),
    )
}


pub fn get_input_value(interaction: &ModalInteraction, custom_id: &str) -> Option<String> {
    interaction
        .data
        .components
        .iter()
        .flat_map(|row| row.components.iter())
        .find_map(|c| match c {
            ActionRowComponent::InputText(input) if input.custom_id == custom_id => {
                input.value.clone()
            }
            _ => None,
        })
}

pub fn get_new_name(interaction: &ModalInteraction) -> Option<String> {
    get_input_value(&interaction, "new_name")
}

pub fn is_rate_limited(err: &serenity::http::HttpError) -> bool {
    matches!(
        err,
        serenity::http::HttpError::UnsuccessfulRequest(resp) if resp.status_code.as_u16() == 429,
    )
}
