use crate::core::config::{get_guild_ctx, replace_ticket_panel_placeholders};
use crate::types::config::config::Format;
use crate::types::embed::DiscordEmbed;
use crate::utils::custom_msg::build_custom_message;
use poise::serenity_prelude as serenity;
use tracing::{debug, trace};

/// Builds the ticket message configuration by evaluating custom layouts or falling back to the standard layout.
pub async fn build_ticket_message_payload(
    http: &serenity::Http,
    guild_id: serenity::GuildId,
    ticket_role_id: Option<u64>,
    format: Option<&Format>,
    content: Option<&String>,
    embed_json: Option<&DiscordEmbed>,
) -> Result<serenity::CreateMessage, Box<dyn std::error::Error + Send + Sync>> {
    let guild_id_u64 = guild_id.get();
    trace!(
        guild_id = guild_id_u64,
        ticket_role_id,
        "Building ticket message payload"
    );

    let role_id_opt = ticket_role_id.map(serenity::RoleId::new);
    let mut role_name_opt = None;

    if let Some(role_id) = role_id_opt {
        trace!(
            guild_id = guild_id_u64,
            role_id = role_id.get(),
            "Retrieving role details for placeholders"
        );
        if let Ok(roles) = guild_id.roles(http).await {
            if let Some(role) = roles.get(&role_id) {
                role_name_opt = Some(role.name.clone());
            }
        }
    }

    trace!(guild_id = guild_id_u64, "Fetching guild context for placeholder evaluation");
    let gctx = get_guild_ctx(guild_id, http).await?;
    let is_embed = format.map_or(true, |f| matches!(f, Format::Embed));

    let custom_msg_opt = build_custom_message(
        is_embed,
        content,
        embed_json,
        |text| {
            replace_ticket_panel_placeholders(
                text,
                &gctx,
                role_id_opt,
                role_name_opt.as_deref(),
            )
        },
    )?;

    let message_builder = match custom_msg_opt {
        Some(custom_msg) => {
            debug!(guild_id = guild_id_u64, "Applying custom ticket panel layout from configuration");
            custom_msg
        }
        None => {
            debug!(guild_id = guild_id_u64, "No custom layout configured; falling back to default embed");
            let description = if let Some(role_id) = ticket_role_id {
                format!(
                    "Click the button below to open a support ticket. Our staff with role <@{}> will assist you shortly.",
                    role_id
                )
            } else {
                "Click the button below to open a support ticket. Our staff will assist you shortly.".to_string()
            };

            let default_embed = serenity::CreateEmbed::default()
                .title("Support Tickets")
                .description(description)
                .color(0x5865F2);

            serenity::CreateMessage::default().embed(default_embed)
        }
    };

    let components = vec![serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new("open_ticket")
            .label("Open Ticket")
            .style(serenity::ButtonStyle::Primary)
            .emoji('🎫'),
    ])];

    Ok(message_builder.components(components))
}