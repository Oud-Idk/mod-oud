use crate::commands::helpers::message_logging;
use crate::core::config::get_settings;
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;

pub struct MessageDetails {
    pub(crate) msg_id: i64,
    pub(crate) author_id: i64,
    pub(crate) author_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) chan_id: i64,
    pub(crate) content: String,
    pub(crate) image_urls: Vec<String>,
}

pub struct EditDetails {
    pub(crate) msg_id: i64,
    pub(crate) chan_id: i64,
    pub(crate) author_id: i64,
    pub(crate) author_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) old_content: Option<String>,
    pub(crate) new_content: Option<String>,
}

pub async fn message_log_delete(
    ctx: &serenity::Context,
    channel_id: &serenity::ChannelId,
    deleted_message_id: &serenity::MessageId,
    guild_id: &Option<serenity::GuildId>,
    _data: &Data,
) -> Result<(), Error> {
    let Some(g_id) = guild_id.map(|id| id.get() as i64) else {
        return Ok(());
    };

    // 1. Load configuration from dynamic settings (JSONB)
    let settings = get_settings(&_data.db, &_data.redis, g_id).await?;
    let Some(raw_id) = settings.message_log_channel_id else {
        return Ok(());
    };
    let del_channel_id = serenity::ChannelId::new(raw_id as u64);

    // 2. Extract message information from the local cache
    let Some(msg) =
        message_logging::fetch_cached_message(&ctx.cache, channel_id, deleted_message_id)
    else {
        return Ok(());
    };

    // 3. Log the deletion to the database
    let joined_image_urls = msg.image_urls.join(",");
    sqlx::query!(
        r#"
        INSERT INTO deleted_messages (message_id, author_id, author_name, channel_id, guild_id, content, attachment_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        msg.msg_id,
        msg.author_id,
        msg.author_name,
        msg.chan_id,
        g_id,
        msg.content,
        joined_image_urls,
    )
        .execute(&_data.db)
        .await?;

    // Quick sanity check to ensure the channel exists before generating embeds
    if del_channel_id.to_channel(&ctx.http).await.is_err() {
        return Ok(());
    }

    // 4. Build message embeds and dispatch log message
    let embeds = message_logging::build_delete_embeds(
        msg.author_id,
        msg.chan_id,
        &msg.content,
        &msg.avatar_url,
        &msg.image_urls,
    );

    let builder = serenity::CreateMessage::new().embeds(embeds);
    let _ = del_channel_id.send_message(&ctx.http, builder).await;

    Ok(())
}

pub async fn message_log_update(
    ctx: &serenity::Context,
    old_if_available: Option<&serenity::Message>,
    new: Option<&serenity::Message>,
    event: &serenity::MessageUpdateEvent,
    _data: &Data,
) -> Result<(), Error> {
    let Some(g_id) = event.guild_id.map(|id| id.get() as i64) else {
        return Ok(());
    };

    // 1. Fetch settings (JSONB)
    let settings = get_settings(&_data.db, &_data.redis, g_id).await?;
    let Some(raw_id) = settings.message_log_channel_id else {
        return Ok(());
    };
    let message_log_channel_id = serenity::ChannelId::new(raw_id as u64);

    // 2. Extract and validate message update details
    let Some(details) = message_logging::extract_edit_details(old_if_available, new, event) else {
        return Ok(());
    };

    // 3. Log modified messages in database
    sqlx::query!(
        r#"
        INSERT INTO modified_messages (message_id, author_id, author_name, channel_id, guild_id, old_content, new_content)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        details.msg_id,
        details.author_id,
        details.author_name,
        details.chan_id,
        g_id,
        details.old_content.as_deref(),
        details.new_content.as_deref(),
    )
        .execute(&_data.db)
        .await?;

    // Quick verification that the log channel is accessible
    if message_log_channel_id.to_channel(&ctx.http).await.is_err() {
        return Ok(());
    }

    // 4. Generate visual embed and send
    let embed = message_logging::build_edit_embed(&details);
    let builder = serenity::CreateMessage::new().embed(embed);
    let _ = message_log_channel_id
        .send_message(&ctx.http, builder)
        .await;

    Ok(())
}
