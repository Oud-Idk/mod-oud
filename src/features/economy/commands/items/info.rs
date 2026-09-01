use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::commands::inventory;
use crate::features::economy::database::categories::get_category;
use crate::features::economy::types::{ItemAction, ItemRequirement, MatchType};
use crate::features::economy::{commands, validation};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;
use std::fmt::Write;

/// View detailed info on a store item
#[poise::command(slash_command, guild_only)]
pub async fn info(
    ctx: Context<'_>,
    #[description = "Item name or ID"] item_input: String,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let Some(_config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    let Some(item) = validation::resolve_item(db, guild_id, &item_input).await? else {
        send_ephemeral(&ctx, "Item not found.").await?;
        return Ok(());
    };

    let mut embed = CreateEmbed::new()
        .title(item.name.clone())
        .field("Price", format!("{}", item.price), true)
        .field("Stock", inventory::format_stock(&item), true)
        .field("Inventory", inventory::yes_no(item.is_inventory), true)
        .field("Usable", inventory::yes_no(item.is_usable), true)
        .field("Sellable", inventory::yes_no(item.is_sellable), true)
        .field("Listed", inventory::yes_no(item.is_listed), true)
        .color(BRAND_COLOR);

    if let Some(cat_id) = item.category_id
        && let Ok(Some(cat)) = get_category(db, guild_id, cat_id).await
    {
        embed = embed.field("Category", cat.name, true);
    }

    if !item.description.is_empty() {
        embed = embed.description(&item.description);
    }

    if let Some(thumb) = item.thumbnail_url() {
        embed = embed.thumbnail(thumb);
    }

    if let Some(ref expires) = item.expires_at {
        embed = embed.field("Expires", format!("<t:{}:R>", expires.timestamp()), true);
    }

    let requirements = item.parsed_requirements();
    if !requirements.is_empty() {
        let req_text = create_requirements_text(&requirements);
        embed = embed.field("Requirements", req_text, false);
    }

    let actions = item.parsed_actions();
    if !actions.is_empty() {
        let act_text = create_actions_text(&actions);
        embed = embed.field("Actions", act_text, false);
    }

    ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true))
        .await?;
    Ok(())
}

fn create_requirements_text(requirements: &[ItemRequirement]) -> String {
    let mut req_text = String::new();
    for req in requirements {
        let trigger_flags = req.trigger_flags();
        let trigger = match (
            trigger_flags.triggers_on_buy(),
            trigger_flags.triggers_on_use(),
        ) {
            (true, true) => "on buy & use",
            (true, false) => "on buy",
            (false, true) => "on use",
            (false, false) => "never",
        };

        match req {
            ItemRequirement::Role {
                match_type,
                role_ids,
                ..
            } => {
                let _ = writeln!(
                    req_text,
                    "- Must {} {} role(s) {trigger}",
                    match match_type {
                        MatchType::Every => "have all",
                        MatchType::AtLeastOne => "have at least one of",
                        MatchType::None => "not have any of",
                    },
                    role_ids.len(),
                );
            }
            ItemRequirement::TotalBalance { balance, .. } => {
                let _ = writeln!(
                    req_text,
                    "- Must have at least {balance} total balance {trigger}",
                );
            }
            ItemRequirement::Item { quantities, .. } => {
                let _ = writeln!(
                    req_text,
                    "- Must own {} required item type(s) {trigger}",
                    quantities.len(),
                );
            }
        }
    }
    req_text
}

fn create_actions_text(actions: &Vec<ItemAction>) -> String {
    let mut act_text = String::new();
    for act in actions {
        let trigger_flags = act.trigger_flags();
        let trigger = match (
            trigger_flags.triggers_on_buy(),
            trigger_flags.triggers_on_use(),
        ) {
            (true, true) => "on buy & use",
            (true, false) => "on buy",
            (false, true) => "on use",
            (false, false) => "never",
        };

        match act {
            ItemAction::Respond { .. } => {
                let _ = writeln!(act_text, "- Sends a custom message {trigger}");
            }
            ItemAction::AddRoles { role_ids, .. } => {
                let _ = writeln!(act_text, "- Adds {} role(s) {trigger}", role_ids.len());
            }
            ItemAction::RemoveRoles { role_ids, .. } => {
                let _ = writeln!(act_text, "- Removes {} role(s) {trigger}", role_ids.len());
            }
            ItemAction::AddBalance { balance, .. } => {
                let _ = writeln!(act_text, "- Grants {balance} coins {trigger}");
            }
            ItemAction::RemoveBalance { balance, .. } => {
                let _ = writeln!(act_text, "- Deducts {balance} coins {trigger}");
            }
            ItemAction::AddItems {
                item_ids,
                quantities,
                ..
            } => {
                let count = if item_ids.is_empty() {
                    quantities.len()
                } else {
                    item_ids.len()
                };
                let _ = writeln!(act_text, "- Gives {count} item(s) {trigger}");
            }
            ItemAction::RemoveItems {
                item_ids,
                quantities,
                ..
            } => {
                let count = if item_ids.is_empty() {
                    quantities.len()
                } else {
                    item_ids.len()
                };
                let _ = writeln!(act_text, "- Removes {count} item(s) {trigger}");
            }
        }
    }
    act_text
}
