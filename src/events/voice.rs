use crate::core::config::{get_guild_ctx, GuildCtx};
use crate::events::handlers::levels::voice::handle_voice_leveling;
use crate::events::handlers::temp_voice;
use crate::events::handlers::temp_voice::refresh_temp_vc_ttl;
use crate::types::{Data, Error};
use crate::utils::placeholders::get_placeholder_regex;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::types::Expiration;
use regex::Captures;
use serde::{Deserialize, Serialize};
use serenity::all::{ChannelId, ChannelType, Context, CreateChannel, GuildId, Member, User, UserId, VoiceState};
use sqlx::PgPool;
use std::str::FromStr;
use tracing::{debug, trace, warn};

pub async fn on_voice_state_update(
    ctx: &Context,
    old: Option<&VoiceState>,
    new: &VoiceState,
    data: &Data,
) -> Result<(), Error> {
    debug!("Handling voice channel state update.");

    let Some(guild_id) = new.guild_id else { return Ok(()) };
    let user_id = new.user_id;

    if let Some(channel_id) = new.channel_id {
        refresh_temp_vc_ttl(data, guild_id, channel_id).await?;
    }
    if let Some(old_channel_id) = old.and_then(|o| o.channel_id) {
        refresh_temp_vc_ttl(data, guild_id, old_channel_id).await?;
    }

    temp_voice::handle_join_hub_temp_vc(ctx, &new, &data, guild_id, user_id).await?;
    temp_voice::handle_leave_temp_vc(ctx, &old, &data, guild_id).await?;
    handle_voice_leveling(ctx, old, &new, &data, guild_id, user_id).await?;

    Ok(())
}