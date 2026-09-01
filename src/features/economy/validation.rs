use crate::core::config::state::{Context, Error};
use crate::features::economy::{database, get_balance};
use crate::features::economy::types::{Item, ItemRequirement, MatchType};
use crate::shared::permissions::HasRoles;
use std::borrow::Cow;
use std::collections::HashMap;
use serenity::all::{GuildId, Member, RoleId, UserId};
use uuid::Uuid;
use crate::features::economy::database::inventory::get_inventory;
use crate::features::economy::database::items::{get_item, get_item_by_name};

pub async fn resolve_item(
    db: &sqlx::PgPool,
    guild_id: GuildId,
    input: &str,
) -> Result<Option<Item>, sqlx::Error> {
    if let Ok(uuid) = Uuid::parse_str(input) {
        get_item(db, guild_id, uuid).await
    } else {
        get_item_by_name(db, guild_id, input).await
    }
}

/// Validates all store requirements for purchasing an item.
/// Returns `Ok(Ok(()))` if all requirements pass, or `Ok(Err(reason))` with a user-friendly error message.
pub async fn validate_buy_requirements(
    ctx: &Context<'_>,
    item: &Item,
    db: &sqlx::PgPool,
) -> Result<Result<(), String>, Error> {
    validate_requirements(ctx, item, db, |r| r.trigger_flags().triggers_on_buy()).await
}

/// Validates all store requirements for using an item.
pub async fn validate_use_requirements(
    ctx: &Context<'_>,
    item: &Item,
    db: &sqlx::PgPool,
) -> Result<Result<(), String>, Error> {
    validate_requirements(ctx, item, db, |r| r.trigger_flags().triggers_on_use()).await
}

async fn validate_requirements<F>(
    ctx: &Context<'_>,
    item: &Item,
    db: &sqlx::PgPool,
    filter: F,
) -> Result<Result<(), String>, Error>
where
    F: Fn(&ItemRequirement) -> bool + Send + Sync,
{
    let user_id = ctx.author().id;
    let guild_id = ctx.guild_id().unwrap();
    let requirements = item.parsed_requirements();

    let member: Cow<'_, Member> = match ctx.author_member().await {
        Some(m) => m,
        None => Cow::Owned(guild_id.member(ctx, user_id).await?),
    };

    for req in requirements.iter().filter(|r| filter(r)) {
        let failure_reason = match req {
            ItemRequirement::Role {
                match_type,
                role_ids,
                ..
            } => check_role_requirement(&member, *match_type, role_ids),
            ItemRequirement::TotalBalance { balance, .. } => {
                check_balance_requirement(db, guild_id, user_id, *balance).await?
            }
            ItemRequirement::Item {
                match_type,
                quantities,
                ..
            } => check_item_requirement(db, guild_id, user_id, *match_type, quantities).await?,
        };

        if let Some(reason) = failure_reason {
            return Ok(Err(reason));
        }
    }

    Ok(Ok(()))
}

/// Validates role prerequisites (sync & fast as lightning ⚡).
fn check_role_requirement(
    member: &Member,
    match_type: MatchType,
    role_ids: &[RoleId],
) -> Option<String> {
    let passed = match match_type {
        MatchType::AtLeastOne => member.has_any_role(role_ids),
        MatchType::None => !member.has_any_role(role_ids),
        MatchType::Every => role_ids
            .iter()
            .all(|&role_id| member.has_any_role(&[role_id])),
    };

    if passed {
        return None;
    }

    let role_mentions = role_ids
        .iter()
        .map(|id| format!("<@&{id}>"))
        .collect::<Vec<_>>()
        .join(", ");

    let reason = match match_type {
        MatchType::Every => {
            format!("You must have **all** of the following roles: {role_mentions}")
        }
        MatchType::AtLeastOne => {
            format!("You need at least **one** of these roles: {role_mentions}")
        }
        MatchType::None => {
            format!("You cannot purchase this while having any of these roles: {role_mentions}")
        }
    };

    Some(reason)
}

/// Validates player total wallet + bank net worth.
async fn check_balance_requirement(
    db: &sqlx::PgPool,
    guild_id: GuildId,
    user_id: UserId,
    required_balance: i64,
) -> Result<Option<String>, Error> {
    let bal = get_balance(db, guild_id, user_id).await?;
    let current_total = bal.total();

    if current_total < required_balance {
        let diff = required_balance - current_total;
        return Ok(Some(format!(
            "Requires a total net worth (wallet + bank) of **{required_balance}** coins.\nYou currently have **{current_total}** (need **{diff}** more)."
        )));
    }

    Ok(None)
}

/// Validates item inventory requirements and builds missing items breakdown.
async fn check_item_requirement(
    db: &sqlx::PgPool,
    guild_id: GuildId,
    user_id: UserId,
    match_type: MatchType,
    quantities: &HashMap<Uuid, i32>,
) -> Result<Option<String>, Error> {
    let inv = get_inventory(db, guild_id, user_id).await?;
    let inv_map: HashMap<Uuid, i32> = inv
        .into_iter()
        .map(|row| (row.item_id, row.quantity))
        .collect();

    let mut missing_items = Vec::new();
    for (req_item_id, &needed_qty) in quantities {
        let owned_qty = inv_map.get(req_item_id).copied().unwrap_or(0);
        if owned_qty < needed_qty {
            missing_items.push((*req_item_id, needed_qty, owned_qty));
        }
    }

    let passed = match match_type {
        MatchType::Every => missing_items.is_empty(),
        MatchType::AtLeastOne => missing_items.len() < quantities.len(),
        MatchType::None => missing_items.len() == quantities.len(),
    };

    if passed {
        return Ok(None);
    }

    let mut item_details = Vec::new();
    for (item_id, needed, owned) in &missing_items {
        let name = match get_item(db, guild_id, *item_id).await? {
            Some(it) => it.name,
            None => "Unknown Item".to_string(),
        };
        item_details.push(format!("• **{name}** (have {owned}/{needed})"));
    }

    let reason = match match_type {
        MatchType::Every => format!(
            "You are missing required prerequisite items:\n{}",
            item_details.join("\n")
        ),
        MatchType::AtLeastOne => format!(
            "You must own at least one of these prerequisite items:\n{}",
            item_details.join("\n")
        ),
        MatchType::None => {
            "You own a restricted item that prevents you from buying this.".to_string()
        }
    };

    Ok(Some(reason))
}

pub fn parse_emoji(emoji: Option<&str>) -> (Option<String>, Option<String>) {
    let Some(e) = emoji.filter(|s| !s.trim().is_empty()) else {
        return (None, None);
    };

    if e.starts_with('<') && e.ends_with('>') {
        let inner = &e[1..e.len() - 1];
        let parts: Vec<&str> = inner.split(':').collect();
        if parts.len() >= 3 {
            return (None, Some(parts[2].to_string()));
        }
    }

    (Some(e.to_string()), None)
}
