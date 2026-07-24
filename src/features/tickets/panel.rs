use crate::core::config::guild_ctx::get_guild_ctx;
use crate::features::tickets::placeholders::replace_ticket_panel_placeholders;
use crate::shared::embed::DiscordEmbed;
use crate::shared::embed::Format;
use crate::shared::embed::build_custom_message;
use tracing::{debug, trace};

/// Builds the ticket message configuration by evaluating custom layouts or falling back to the standard layout.
pub async fn build_ticket_message_payload(
    http: &serenity::all::Http,
    guild_id: serenity::all::GuildId,
    ticket_role_id: Option<u64>,
    format: Option<&Format>,
    content: Option<&String>,
    embed_json: Option<&DiscordEmbed>,
) -> Result<serenity::all::CreateMessage, Box<dyn std::error::Error + Send + Sync>> {
    let guild_id_u64 = guild_id.get();
    trace!(
        guild_id = guild_id_u64,
        ticket_role_id,
        "Building ticket message payload"
    );

    let role_id_opt = ticket_role_id.map(serenity::all::RoleId::new);
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

    let custom_msg_opt = build_custom_message(
        format.unwrap_or(&Format::Embed),
        content.map(String::as_str),
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

            let default_embed = serenity::all::CreateEmbed::default()
                .title("Support Tickets")
                .description(description)
                .color(0x5865F2);

            serenity::all::CreateMessage::default().embed(default_embed)
        }
    };

    let components = vec![serenity::all::CreateActionRow::Buttons(vec![
        serenity::all::CreateButton::new("open_ticket")
            .label("Open Ticket")
            .style(serenity::all::ButtonStyle::Primary)
            .emoji('🎫'),
    ])];

    Ok(message_builder.components(components))
}