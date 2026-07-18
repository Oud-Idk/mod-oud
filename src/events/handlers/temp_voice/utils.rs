use crate::events::handlers::temp_voice::{placeholder, TempVoiceHub};
use crate::types::Error;
use serenity::all::{ChannelId, ChannelType, Context, CreateChannel, GuildChannel, GuildId, Member};
use std::str::FromStr;
use tracing::debug;

pub async fn create_temp_vc(ctx: &Context, guild_id: &GuildId, member: &Member, hub_info: &TempVoiceHub) -> Result<GuildChannel, Error> {
    let category_id = ChannelId::new(hub_info.category_id as u64);
    let channel_name = placeholder::replace_channel_placeholders(hub_info.default_channel_name.as_str(), &guild_id, &ctx, &member).await?;

    let mut channel_builder = CreateChannel::new(channel_name)
        .kind(ChannelType::Voice)
        .category(category_id);

    if let Some(limit) = hub_info.user_limit {
        if limit > 0 {
            channel_builder = channel_builder.user_limit(limit as u32);
        }
    }

    let new_channel = guild_id.create_channel(&ctx, channel_builder).await?;
    debug!(new_channel_id = new_channel.id.get(), "Created temp voice channel.");
    Ok(new_channel)
}