use crate::types::{Data, Error};
use fred::interfaces::{HashesInterface, KeysInterface};
use log::warn;
use serenity::all::{Context, Guild, GuildId, InviteCreateEvent, InviteDeleteEvent, Member};
use std::collections::HashMap;
use tracing::debug;


fn invites_key(guild_id: GuildId) -> String {
    format!("guild:invites:{guild_id}")
}

fn inviters_key(guild_id: GuildId) -> String {
    format!("guild:invite_inviters:{guild_id}")
}

fn invited_by_key(guild_id: GuildId) -> String {
    format!("guild:invited_by:{guild_id}")
}

fn inviter_counts_key(guild_id: GuildId) -> String {
    format!("guild:inviter_counts:{guild_id}")
}

fn codes_by_inviter_key(guild_id: GuildId) -> String {
    format!("guild:codes_by_inviter:{guild_id}")
}


pub async fn fetch_current_invites(ctx: &Context, guild: &Guild, data: &Data) -> Result<(), Error> {
    let redis = &data.redis;
    let invites = guild.invites(&ctx).await?;
    let cache_key = invites_key(guild.id);
    let inv_key = inviters_key(guild.id);

    let pipe = redis.pipeline();
    let _: () = pipe.del(&cache_key).await?; // Invalidate immediately in case cache is stale

    if invites.is_empty() {
        debug!(guild_id = guild.id.get(), "No invites for this guild. Skipping");
        let _: () = pipe.all().await?; // Execute only the DEL command
        return Ok(());
    }

    // Collect (invite_code, uses) pairs.
    let uses_items: Vec<(&str, u64)> = invites
        .iter()
        .map(|inv| (inv.code.as_str(), inv.uses))
        .collect();

    // Collect (invite_code, inviter_id) pairs, skipping vanity invites.
    let inviter_items: Vec<(&str, u64)> = invites
        .iter()
        .filter_map(|inv| inv.inviter.as_ref().map(
            |u| (inv.code.as_str(), u.id.get()))
        )
        .collect();

    // Collect (inviter_id, invite_code), skipping vanity invites
    let codes_by_inviter_items: Vec<(u64, &str)> = invites
        .iter()
        .filter_map(|inv| inv.inviter.as_ref().map(
            |u| (u.id.get(), inv.code.as_str()))
        )
        .collect();

    if !codes_by_inviter_items.is_empty() {
        let _: () = pipe.hset(&codes_by_inviter_key(guild.id), codes_by_inviter_items).await?;
    }

    let _: () = pipe.hset(&cache_key, uses_items).await?;
    if !inviter_items.is_empty() {
        let _: () = pipe.hset(&inv_key, inviter_items).await?;
    }

    let _: () = pipe.all().await?;

    debug!(guild_id = guild.id.get(), "Stored all invite data for guild.");

    Ok(())
}

pub async fn store_invite(_: &Context, invite_data: &InviteCreateEvent, data: &Data) -> Result<(), Error> {
    let redis = &data.redis;
    let Some(guild_id) = invite_data.guild_id else {
        debug!(guild_id = invite_data.code, "Couldn't get guild_id for invite");
        return Ok(())
    };

    let cache_key = invites_key(guild_id);
    let inv_key = inviters_key(guild_id);

    let pipe = redis.pipeline();
    let _: () = pipe.hset(&cache_key, (invite_data.code.as_str(), invite_data.uses)).await?;

    if let Some(inviter) = &invite_data.inviter {
        let _: () = pipe.hset(&inv_key, (invite_data.code.as_str(), inviter.id.get())).await?;
        let _: () = pipe.hset(&codes_by_inviter_key(guild_id), (inviter.id.get(), invite_data.code.as_str())).await?;
    }

    let _: () = pipe.all().await?;
    debug!(guild_id = guild_id.get(), code = %invite_data.code, "Cached new invite");

    Ok(())
}

pub async fn delete_invite(_: &Context, invite_data: &InviteDeleteEvent, data: &Data) -> Result<(), Error> {
    let redis = &data.redis;
    let Some(guild_id) = invite_data.guild_id else {
        debug!(guild_id = invite_data.code, "Couldn't get guild_id for invite");
        return Ok(())
    };

    let cache_key = invites_key(guild_id);
    let inv_key = inviters_key(guild_id);

    let pipe = redis.pipeline();
    let _: () = pipe.hdel(&cache_key, invite_data.code.as_str()).await?;
    let _: () = pipe.hdel(&inv_key, invite_data.code.as_str()).await?;
    let _: () = pipe.all().await?;

    debug!(guild_id = guild_id.get(), code = %invite_data.code, "Deleted invite from cache");

    Ok(())
}

pub async fn store_member_invite(ctx: &Context, new_member: &Member, data: &Data) -> Result<(), Error> {
    let guild_id = new_member.guild_id;
    let redis = &data.redis;

    let current_invites = guild_id.invites(&ctx.http).await.inspect_err(|err| {
        warn!("Failed to fetch invites for guild {}: {:?}", guild_id, err);
    })?;

    let cache_key = invites_key(guild_id);
    let inv_key = inviters_key(guild_id);

    // Snapshot of uses counts as of the last time we cached them
    let old_uses: HashMap<String, u64> = redis.hgetall(&cache_key).await.unwrap_or_default();

    // Find the invite whose uses count went up since we last cached
    let used_code = current_invites.iter().find_map(|inv| {
        let prev = old_uses.get(inv.code.as_str()).copied().unwrap_or(0);
        (inv.uses > prev).then(|| inv.code.clone())
    });

    // Refresh the cache with the fresh counts regardless of whether we
    // could attribute this particular join, so future diffs stay accurate.
    let uses_items: Vec<(&str, u64)> = current_invites
        .iter()
        .map(|inv| (inv.code.as_str(), inv.uses))
        .collect();

    if !uses_items.is_empty() {
        let _: () = redis.hset(&cache_key, uses_items).await?;
    }

    let Some(code) = used_code else {
        debug!(
            guild_id = guild_id.get(),
            member_id = new_member.user.id.get(),
            "Could not determine which invite was used (vanity URL, oauth join, or bot invite?)"
        );
        return Ok(());
    };

    let inviter_id: Option<u64> = redis.hget(&inv_key, &code).await.unwrap_or(None);
    let Some(inviter_id) = inviter_id else {
        debug!(guild_id = guild_id.get(), %code, "No cached inviter for this code");
        return Ok(());
    };

    let mut tx = data.db.begin().await?;

    sqlx::query!(
        r#"
        INSERT INTO invited_members (guild_id, member_id, inviter_id, invite_code)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, member_id) DO UPDATE
            SET inviter_id  = EXCLUDED.inviter_id,
                invite_code = EXCLUDED.invite_code,
                created_at  = now()
        "#,
        guild_id.get() as i64,
        new_member.user.id.get() as i64,
        inviter_id as i64,
        code,
    )
        .execute(&mut *tx)
        .await?;

    let new_count: i64 = sqlx::query_scalar!(
        r#"
        INSERT INTO inviter_counts (guild_id, inviter_id, count)
        VALUES ($1, $2, 1)
        ON CONFLICT (guild_id, inviter_id) DO UPDATE
            SET count = inviter_counts.count + 1
        RETURNING count
        "#,
        guild_id.get() as i64,
        inviter_id as i64,
    )
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    // Sync Redis to the authoritative Postgres value (not a separate HINCRBY,
    // to avoid the two stores ever drifting apart).
    let pipe = redis.pipeline();
    let _: () = pipe
        .hset(&invited_by_key(guild_id), (new_member.user.id.get(), inviter_id))
        .await?;
    let _: () = pipe
        .hset(&inviter_counts_key(guild_id), (inviter_id.to_string(), new_count))
        .await?;
    let _: () = pipe.all().await?;

    debug!(
        guild_id = guild_id.get(),
        member_id = new_member.user.id.get(),
        inviter_id,
        %code,
        "Attributed join to inviter"
    );

    Ok(())
}