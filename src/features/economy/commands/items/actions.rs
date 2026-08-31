use crate::core::config::state::{Context, Error};
use crate::features::economy::database;
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
    F: Fn(&ItemAction) -> bool,
{
    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let actions = item.parsed_actions();

    for act in actions.into_iter().filter(filter) {
        match act {
            ItemAction::AddRoles { role_ids, .. } => {
                for role_id in role_ids {
                    if let Err(err) = ctx
                        .http()
                        .add_member_role(
                            guild_id,
                            user_id,
                            role_id,
                            Some(&format!("Item action: {}", item.name)),
                        )
                        .await
                    {
                        tracing::warn!("Failed to add role {role_id} to user {user_id}: {err}");
                    }
                }
            }
            ItemAction::RemoveRoles { role_ids, .. } => {
                for role_id in role_ids {
                    if let Err(err) = ctx
                        .http()
                        .remove_member_role(
                            guild_id,
                            user_id,
                            role_id,
                            Some(&format!("Item action: {}", item.name)),
                        )
                        .await
                    {
                        tracing::warn!(
                            "Failed to remove role {role_id} from user {user_id}: {err}"
                        );
                    }
                }
            }
            ItemAction::AddBalance { balance, .. } => {
                let bonus = balance * (quantity as i64);
                if bonus > 0 {
                    database::add_cash(db, guild_id, user_id, bonus).await?;
                }
            }
            ItemAction::RemoveBalance { balance, .. } => {
                let deduction = balance * (quantity as i64);
                if deduction > 0 {
                    let _ = database::deduct_cash(db, guild_id, user_id, deduction).await?;
                }
            }
            ItemAction::AddItems {
                quantities,
                item_ids,
                ..
            } => {
                if !quantities.is_empty() {
                    for (bonus_item_id, count) in quantities {
                        let total_give = (count as i32) * quantity;
                        database::add_inventory_item(
                            db,
                            guild_id,
                            user_id,
                            bonus_item_id,
                            total_give,
                        )
                        .await?;
                    }
                } else {
                    for bonus_item_id in item_ids {
                        database::add_inventory_item(
                            db,
                            guild_id,
                            user_id,
                            bonus_item_id,
                            quantity,
                        )
                        .await?;
                    }
                }
            }
            ItemAction::RemoveItems {
                quantities,
                item_ids,
                ..
            } => {
                if !quantities.is_empty() {
                    for (item_to_remove, count) in quantities {
                        let total_remove = (count as i32) * quantity;
                        database::remove_inventory_item(
                            db,
                            guild_id,
                            user_id,
                            item_to_remove,
                            total_remove,
                        )
                        .await?;
                    }
                } else {
                    for item_to_remove in item_ids {
                        database::remove_inventory_item(
                            db,
                            guild_id,
                            user_id,
                            item_to_remove,
                            quantity,
                        )
                        .await?;
                    }
                }
            }
            ItemAction::Respond { message, .. } => {
                if let Some(layout) = message {
                    let _ = ctx
                        .send(
                            poise::CreateReply::default()
                                .content(layout.content)
                                .ephemeral(true),
                        )
                        .await;
                }
            }
        }
    }

    Ok(())
}
