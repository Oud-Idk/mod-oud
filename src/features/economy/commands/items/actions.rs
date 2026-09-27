use serenity::model::id::{GuildId, UserId};
use sqlx::PgTransaction;
use uuid::Uuid;

use crate::core::config::state::{Context, Error};
use crate::features::economy::database::balances::{add_cash_tx, deduct_cash_tx};
use crate::features::economy::database::inventory::{
    add_inventory_item_tx, remove_inventory_item_tx,
};
use crate::features::economy::types::{ActionTrigger, Item, ItemAction, ItemDbActions};
use tracing::{error, warn};

/// Parses an item's actions, refusing the operation if the stored JSONB is malformed.
///
/// An unparseable action list would otherwise consume the item and grant nothing, or let a
/// purchase through with its effects silently dropped.
pub fn parse_actions(ctx: &Context<'_>, item: &Item) -> Result<Vec<ItemAction>, Error> {
    item.parsed_actions().map_err(|e| {
        error!(
            error = ?e,
            error_chain = %format!("{e:#}"),
            guild_id = ?ctx.guild_id(),
            user_id = %ctx.author().id,
            item_id = %item.id,
            item_name = %item.name,
            "item actions could not be parsed; refusing the operation"
        );
        anyhow::anyhow!("This item is misconfigured and cannot be used right now.")
    })
}

/// Resolves the database-side effects of an item's actions.
///
/// Takes the already-parsed actions so the JSONB is read once. Amounts use checked arithmetic: a
/// dashboard value large enough to overflow aborts the whole purchase rather than half-applying
/// the item.
pub fn resolve_db_actions(
    actions: &[ItemAction],
    item_name: &str,
    quantity: i32,
    trigger: ActionTrigger,
) -> Result<ItemDbActions, Error> {
    let multiplier = i64::from(quantity);
    let mut out = ItemDbActions::default();

    for action in actions.iter().filter(|a| trigger.matches(a)) {
        match action {
            ItemAction::AddBalance { balance, .. } => {
                let amount = *balance;
                out.add_cash = out
                    .add_cash
                    .checked_add(
                        amount
                            .checked_mul(multiplier)
                            .ok_or_else(|| overflow(item_name, amount, quantity))?,
                    )
                    .ok_or_else(|| overflow(item_name, amount, quantity))?;
            }
            ItemAction::RemoveBalance { balance, .. } => {
                let amount = *balance;
                out.deduct_cash = out
                    .deduct_cash
                    .checked_add(
                        amount
                            .checked_mul(multiplier)
                            .ok_or_else(|| overflow(item_name, amount, quantity))?,
                    )
                    .ok_or_else(|| overflow(item_name, amount, quantity))?;
            }
            ItemAction::AddItems {
                quantities,
                item_ids,
                ..
            } => out
                .add_items
                .extend(resolve_item_counts(&quantities, &item_ids, quantity)),
            ItemAction::RemoveItems {
                quantities,
                item_ids,
                ..
            } => out
                .remove_items
                .extend(resolve_item_counts(&quantities, &item_ids, quantity)),
            ItemAction::AddRoles { .. }
            | ItemAction::RemoveRoles { .. }
            | ItemAction::Respond { .. } => {}
        }
    }

    Ok(out)
}

fn overflow(item_name: &str, balance: i64, quantity: i32) -> Error {
    anyhow::anyhow!(
        "Item '{item_name}' has an action amount of {balance} x {quantity} that overflows i64"
    )
}

/// Applies `actions` inside the caller's transaction.
///
/// Returns [`sqlx::Error`] rather than [`Error`] so it composes with the transaction helpers in
/// `database`, which all speak `sqlx`.
///
/// # Errors
/// Returns [`Err`] if any database write fails.
pub async fn apply_db_actions(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    item: &Item,
    actions: &ItemDbActions,
) -> Result<(), sqlx::Error> {
    if actions.add_cash > 0 {
        add_cash_tx(tx, guild_id, user_id, actions.add_cash).await?;
    }

    if actions.deduct_cash > 0
        && deduct_cash_tx(tx, guild_id, user_id, actions.deduct_cash)
            .await?
            .is_none()
    {
        // The item is still consumed either way, so record the uncharged fee.
        warn!(
            %guild_id,
            %user_id,
            item_id = %item.id,
            item_name = %item.name,
            deduction = actions.deduct_cash,
            "item RemoveBalance could not charge the user; the item was still consumed"
        );
    }

    for &(id, count) in &actions.add_items {
        add_inventory_item_tx(tx, guild_id, user_id, id, count).await?;
    }

    for &(id, count) in &actions.remove_items {
        remove_inventory_item_tx(tx, guild_id, user_id, id, count).await?;
    }

    Ok(())
}

/// Runs the Discord-side actions.
///
/// Call this after the transaction commits. Role changes and replies cannot be rolled back, so a
/// failure here leaves the database correct and the role missing, which `modify_roles` records.
pub async fn apply_discord_actions(
    ctx: &Context<'_>,
    item: &Item,
    actions: &[ItemAction],
    trigger: ActionTrigger,
) {
    let Some(guild_id) = ctx.guild_id() else {
        return;
    };
    let user_id = ctx.author().id;

    for action in actions.iter().filter(|a| trigger.matches(a)) {
        match action {
            ItemAction::AddRoles { role_ids, .. } => {
                modify_roles(ctx, guild_id, user_id, &role_ids, &item.name, true).await;
            }
            ItemAction::RemoveRoles { role_ids, .. } => {
                modify_roles(ctx, guild_id, user_id, &role_ids, &item.name, false).await;
            }
            ItemAction::Respond {
                message: Some(layout),
                ..
            } => {
                if let Err(e) = ctx
                    .send(
                        poise::CreateReply::default()
                            .content(&layout.content)
                            .ephemeral(true),
                    )
                    .await
                {
                    warn!(
                        error = ?e,
                        error_chain = %format!("{e:#}"),
                        %guild_id,
                        %user_id,
                        item_id = %item.id,
                        "item action response not sent; the user received no feedback"
                    );
                }
            }
            ItemAction::Respond { message: None, .. }
            | ItemAction::AddBalance { .. }
            | ItemAction::RemoveBalance { .. }
            | ItemAction::AddItems { .. }
            | ItemAction::RemoveItems { .. } => {}
        }
    }
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
            warn!(
                error = ?err,
                error_chain = %format!("{err:#}"),
                %guild_id,
                %user_id,
                %role_id,
                item_name,
                action,
                "item role action failed after the item was paid for and consumed"
            );
        }
    }
}

/// Normalizes both `quantities` map and `item_ids` fallback into a single list of
/// (`item_id`, `total_qty`).
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
            .map(|(&id, &cnt)| (id, cnt.saturating_mul(multiplier)))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::economy::types::TriggerFlags;
    use serde_json::json;

    fn item_with(actions: serde_json::Value) -> Item {
        Item {
            id: Uuid::nil(),
            guild_id: GuildId::new(1),
            name: "Test Item".to_string(),
            description: String::new(),
            price: 100,
            category_id: None,
            emoji_unicode: None,
            emoji_id: None,
            is_inventory: true,
            is_usable: true,
            is_sellable: false,
            is_listed: true,
            unlimited_stock: false,
            stock_remaining: 10,
            requirements: json!({}),
            actions,
            expires_at: None,
            created_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn resolves_only_the_matching_trigger() {
        let item = item_with(json!([
            { "type": "ADD_BALANCE", "balance": 50, "triggerFlags": 0b11 },
            { "type": "REMOVE_BALANCE", "balance": 10, "triggerFlags": 0b10 },
        ]));

        let on_buy = resolve(&item, 2, ActionTrigger::Buy).unwrap();
        assert_eq!(on_buy.add_cash, 100);
        assert_eq!(
            on_buy.deduct_cash, 0,
            "use-only action must not apply on buy"
        );

        let on_use = resolve(&item, 2, ActionTrigger::Use).unwrap();
        assert_eq!(on_use.add_cash, 100);
        assert_eq!(on_use.deduct_cash, 20);
    }

    #[test]
    fn role_actions_produce_no_database_effect() {
        let item = item_with(json!([
            { "type": "ADD_ROLES", "roleIds": ["123456789012345678"] },
            { "type": "RESPOND", "message": null },
        ]));
        let actions = resolve(&item, 1, ActionTrigger::Buy).unwrap();
        assert_eq!(actions.add_cash, 0);
        assert_eq!(actions.deduct_cash, 0);
        assert!(actions.add_items.is_empty());
        assert!(actions.remove_items.is_empty());
    }

    #[test]
    fn overflow_is_rejected_rather_than_wrapped() {
        let item = item_with(json!([
            { "type": "ADD_BALANCE", "balance": i64::MAX },
        ]));
        assert!(resolve(&item, 2, ActionTrigger::Buy).is_err());
    }

    #[test]
    fn overflow_across_two_actions_is_rejected() {
        // Each amount is fine alone; the running total is not.
        let item = item_with(json!([
            { "type": "ADD_BALANCE", "balance": i64::MAX },
            { "type": "ADD_BALANCE", "balance": 1 },
        ]));
        assert!(resolve(&item, 1, ActionTrigger::Buy).is_err());
    }

    #[test]
    fn item_quantities_scale_with_the_purchase() {
        let target = Uuid::from_u128(42);
        let item = item_with(json!([
            { "type": "ADD_ITEMS", "itemIds": [target.to_string()] },
        ]));
        let actions = resolve(&item, 3, ActionTrigger::Buy).unwrap();
        assert_eq!(actions.add_items, vec![(target, 3)]);
    }

    #[test]
    fn explicit_quantities_win_over_the_item_id_fallback() {
        let a = Uuid::from_u128(1);
        let b = Uuid::from_u128(2);
        let item = item_with(json!([{
            "type": "REMOVE_ITEMS",
            "triggerFlags": 0b10,
            "itemIds": [a.to_string(), b.to_string()],
            "quantities": { a.to_string(): 5, b.to_string(): 2 },
        }]));
        let actions = resolve(&item, 10, ActionTrigger::Use).unwrap();
        let mut got = actions.remove_items;
        got.sort();
        assert_eq!(got, vec![(a, 50), (b, 20)]);
    }

    /// Parses, asserting the JSONB is well formed, then resolves.
    fn resolve(item: &Item, quantity: i32, trigger: ActionTrigger) -> Result<ItemDbActions, Error> {
        let parsed = item.parsed_actions().expect("fixture must be valid JSONB");
        resolve_db_actions(&parsed, &item.name, quantity, trigger)
    }

    #[test]
    fn malformed_actions_json_is_an_error_not_an_empty_list() {
        // The bug this guards: a parse failure used to become an empty Vec, so a broken item
        // looked like an item with no effects and was consumed for nothing.
        let item = item_with(json!({ "type": "ADD_BALANCE", "balance": "not a number" }));
        assert!(item.parsed_actions().is_err());
    }

    #[test]
    fn an_empty_action_list_is_still_valid() {
        let item = item_with(json!([]));
        let actions = resolve(&item, 1, ActionTrigger::Buy).unwrap();
        assert_eq!(actions.add_cash, 0);
        assert!(actions.add_items.is_empty());
    }

    #[test]
    fn trigger_flags_default_to_both() {
        let plain = ItemAction::AddBalance {
            balance: 5,
            trigger_flags: TriggerFlags(0b11),
        };
        assert!(ActionTrigger::Buy.matches(&plain));
        assert!(ActionTrigger::Use.matches(&plain));
    }
}
