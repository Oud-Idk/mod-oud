use crate::core::config::settings::get_settings;
use crate::core::config::state::BotData;
use crate::features::dynamic_slowmode::cache;
use serenity::all::{ChannelType, Message};
use tracing::warn;

/// Whether this channel can carry slowmode at all.
///
/// Categories and announcements reject `rate_limit_per_user`; threads and forums need another path.
#[must_use]
pub const fn is_supported_kind(kind: ChannelType) -> bool {
    matches!(
        kind,
        ChannelType::Text | ChannelType::Voice | ChannelType::Stage
    )
}

/// Whether a message should count toward the channel's traffic.
///
/// Bots and webhooks are skipped; bypass members are still counted, since serenity cannot see `BYPASS_SLOWMODE`.
#[must_use]
pub const fn counts_toward_traffic(message: &Message) -> bool {
    if message.guild_id.is_none() {
        return false;
    }
    if message.author.bot {
        return false;
    }
    if message.webhook_id.is_some() {
        return false;
    }
    true
}

/// Records one message into its channel's traffic window, if the channel is tracked.
///
/// Runs before automod's short-circuit, and never fails the pipeline.
pub async fn record_message(data: &BotData, message: &Message) {
    if !counts_toward_traffic(message) {
        return;
    }

    let Some(guild_id) = message.guild_id else {
        return;
    };

    let settings = match get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await
    {
        Ok(settings) => settings,
        Err(e) => {
            warn!(error = ?e, %guild_id, fallback = "not counted", "slowmode settings lookup failed");
            return;
        }
    };

    let Some(config) = settings.dynamic_slowmode.map(|boxed| *boxed) else {
        return;
    };

    if !config.enabled || !config.channels.contains(&message.channel_id) {
        return;
    }

    if let Err(e) = cache::record_message(
        &data.core.redis,
        guild_id,
        message.channel_id,
        message.author.id,
        config.window_secs,
    )
    .await
    {
        warn!(
            error = ?e,
            %guild_id,
            channel_id = %message.channel_id,
            "slowmode counter write failed"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_text_voice_and_stage_support_slowmode() {
        assert!(is_supported_kind(ChannelType::Text));
        assert!(is_supported_kind(ChannelType::Voice));
        assert!(is_supported_kind(ChannelType::Stage));

        assert!(!is_supported_kind(ChannelType::Category));
        assert!(!is_supported_kind(ChannelType::News));
        assert!(!is_supported_kind(ChannelType::Forum));
        assert!(!is_supported_kind(ChannelType::PublicThread));
    }
}
