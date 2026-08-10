use serenity::all::ChannelId;

pub fn media_channel_key(channel_id: ChannelId) -> String {
    format!("media_channel:{}", channel_id)
}