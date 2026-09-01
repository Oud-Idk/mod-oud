use serenity::model::id::{GuildId, UserId};
use uuid::Uuid;

use crate::core::config::state::{Context, Error};
use crate::features::economy::database::balances::{add_cash_tx, deduct_cash_tx};
use crate::features::economy::database::inventory::{
    add_inventory_item_tx, remove_inventory_item_tx,
};
use crate::features::economy::types::{Item, ItemAction};

/// Executes all actions attached to an item that trigger on purchase.
pub async fn execute_buy_actions(
    ctx: &Context<'_>,
    item: &Item,
    quantity: i32,
) -> Result<(), Error> {
    execute_filtered_actions(ctx, item, quantity, |a| a.trigger_flags().triggers_on_buy()).await
}

/// Executes all actions attached to an item that trigger on use.
pub async fn execute_use_actions(
    ctx: &Context<'_>,
    item: &Item,
    quantity: i32,
) -> Result<(), Error> {
    execute_filtered_actions(ctx, item, quantity, |a| a.trigger_flags().triggers_on_use()).await
}

async fn execute_filtered_actions<F>(
    ctx: &Context<'_>,
    item: &Item,
    quantity: i32,
    filter: F,
) -> Result<(), Error>
where
    F: Fn(&ItemAction) -> bool + Send + Sync,
{
    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let actions = item.parsed_actions();

    let mut tx = db.begin().await?;

    for act in actions.into_iter().filter(filter) {
        match act {
            ItemAction::AddRoles { role_ids, .. } => {
                // Discord API calls (can't be in a Postgres tx, but fine to run)
                modify_roles(ctx, guild_id, user_id, &role_ids, &item.name, true).await;
            }
            ItemAction::RemoveRoles { role_ids, .. } => {
                modify_roles(ctx, guild_id, user_id, &role_ids, &item.name, false).await;
            }
            ItemAction::AddBalance { balance, .. } => {
                let bonus = balance * i64::from(quantity);
                if bonus > 0 {
                    add_cash_tx(&mut tx, guild_id, user_id, bonus).await?;
                }
            }
            ItemAction::RemoveBalance { balance, .. } => {
                let deduction = balance * i64::from(quantity);
                if deduction > 0 {
                    deduct_cash_tx(&mut tx, guild_id, user_id, deduction).await?;
                }
            }
            ItemAction::AddItems {
                quantities,
                item_ids,
                ..
            } => {
                for (id, count) in resolve_item_counts(&quantities, &item_ids, quantity) {
                    add_inventory_item_tx(&mut tx, guild_id, user_id, id, count).await?;
                }
            }
            ItemAction::RemoveItems {
                quantities,
                item_ids,
                ..
            } => {
                for (id, count) in resolve_item_counts(&quantities, &item_ids, quantity) {
                    remove_inventory_item_tx(&mut tx, guild_id, user_id, id, count).await?;
                }
            }
            ItemAction::Respond {
                message: Some(layout),
                ..
            } => {
                let _ = ctx
                    .send(
                        poise::CreateReply::default()
                            .content(layout.content)
                            .ephemeral(true),
                    )
                    .await;
            }
            ItemAction::Respond { message: None, .. } => {}
        }
    }

    tx.commit().await?;

    Ok(())
}

/// Adds or removes a list of roles, logging warnings on failure.
async fn modify_roles(
    ctx: &Context<'_>,
    guild_id: GuildId,
    user_id: UserId,
    role_ids: &[serenity::all::RoleId],
    item_name: &str,
    add: bool,
) {
    let reason = format!("Item action: {item_name}");
    for &role_id in role_ids {
        let res = if add {
            ctx.http()
                .add_member_role(guild_id, user_id, role_id, Some(&reason))
                .await
        } else {
            ctx.http()
                .remove_member_role(guild_id, user_id, role_id, Some(&reason))
                .await
        };

        if let Err(err) = res {
            let action = if add { "add" } else { "remove" };
            tracing::warn!("Failed to {action} role {role_id} for user {user_id}: {err}");
        }
    }
}

/// Normalizes both `quantities` map and `item_ids` fallback into a single list of (item_id, total_qty)
fn resolve_item_counts(
    quantities: &std::collections::HashMap<Uuid, i32>,
    item_ids: &[Uuid],
    multiplier: i32,
) -> Vec<(Uuid, i32)> {
    if quantities.is_empty() {
        item_ids.iter().map(|&id| (id, multiplier)).collect()
    } else {
        quantities
            .iter()
            .map(|(&id, &cnt)| (id, cnt * multiplier))
            .collect()
    }
}
