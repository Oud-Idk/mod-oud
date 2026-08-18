use crate::constants::BRAND_COLOR;
use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::state::Error;
use crate::features::tickets::placeholders::replace_ticket_panel_placeholders;
use crate::shared::embed::DiscordEmbed;
use crate::shared::embed::Format;
use crate::shared::embed::build_custom_message;
use serenity::all::{
    ButtonStyle, CreateActionRow, CreateButton, CreateEmbed, CreateMessage, RoleId,
};
use tracing::{debug, trace};

/// Builds the ticket message configuration by evaluating custom layouts or falling back to the standard layout.
pub async fn build_ticket_message_payload(
    http: &serenity::all::Http,
    guild_id: serenity::all::GuildId,
    role_id: RoleId,
    format: Format,
    content: &str,
    embed_json: &DiscordEmbed,
) -> Result<CreateMessage, Error> {
    trace!(
        %guild_id,
        %role_id,
        "Building ticket message payload"
    );

    let mut role_name_opt = None;

    trace!(
        %guild_id,
        %role_id,
        "Retrieving role details for placeholders"
    );
    if let Ok(roles) = guild_id.roles(http).await
        && let Some(role) = roles.get(&role_id)
    {
        role_name_opt = Some(role.name.clone());
    }

    trace!(
        %guild_id,
        "Fetching guild context for placeholder evaluation"
    );
    let gctx = get_guild_ctx(guild_id, http).await?;

    let custom_msg_opt = build_custom_message(format, content, embed_json, |text| {
        replace_ticket_panel_placeholders(text, &gctx, role_id, role_name_opt.as_deref())
    })?;

    let message_builder = match custom_msg_opt {
        Some(custom_msg) => {
            debug!(
                %guild_id,
                "Applying custom ticket panel layout from configuration"
            );
            custom_msg
        }
        None => {
            debug!(
                %guild_id,
                "No custom layout configured; falling back to default embed"
            );
            let description = format!(
                "Click the button below to open a support ticket. Our staff with role <@{role_id}> will assist you shortly."
            );

            let default_embed = CreateEmbed::default()
                .title("Support Tickets")
                .description(description)
                .color(BRAND_COLOR);

            CreateMessage::default().embed(default_embed)
        }
    };

    let components = vec![CreateActionRow::Buttons(vec![
        CreateButton::new("open_ticket")
            .label("Open Ticket")
            .style(ButtonStyle::Primary)
            .emoji('🎫'),
    ])];

    Ok(message_builder.components(components))
}
