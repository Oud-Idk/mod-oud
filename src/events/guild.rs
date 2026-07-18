use crate::events::handlers::invite_tracking::{delete_invite, fetch_current_invites, store_invite};
use crate::types::{Data, Error};
use serenity::all::{Context, Guild, InviteCreateEvent, InviteDeleteEvent};

pub async fn on_guild_create(ctx: &Context, guild: &Guild, data: &Data) -> Result<(), Error> {
    fetch_current_invites(ctx, guild, data).await?;

    Ok(())
}

pub async fn on_invite_create(ctx: &Context, invite_data: &InviteCreateEvent, data: &Data) -> Result<(), Error> {
    store_invite(ctx, invite_data, data).await?;

    Ok(())
}

pub async fn on_invite_delete(ctx: &Context, invite_data: &InviteDeleteEvent, data: &Data) -> Result<(), Error> {
    delete_invite(ctx, invite_data, data).await?;

    Ok(())
}