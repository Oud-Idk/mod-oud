use crate::core::config::guild_ctx::GuildCtx;
use crate::shared::placeholders::{DiscordCtx, render};
use serenity::all::User;

pub fn replace_user_placeholders(
    text: &str,
    gctx: &GuildCtx,
    user: &User,
) -> String {
    let discord = DiscordCtx {
        gctx: Some(gctx),
        user: Some(user),
        ..Default::default()
    };
    render(text, &discord)
}