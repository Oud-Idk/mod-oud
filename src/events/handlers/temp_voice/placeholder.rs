use crate::core::config::{get_guild_ctx, GuildCtx};
use crate::types::Error;
use crate::utils::placeholders::get_placeholder_regex;
use regex::Captures;
use serenity::all::{Context, GuildId, Member};

fn replace_placeholder(gctx: Option<&GuildCtx>, member: &Member, key: &str) -> Option<String> {
    match key {
        "user.display_name" => Some(member.display_name().to_string()),
        "user.username" => Some(member.user.name.to_string()),
        "user.id" => Some(member.user.id.to_string()),
        "guild.name" => gctx.map(|g| g.name.to_string()),
        _ => None,
    }
}

/// Determines if a specific placeholder key requires the GuildCtx database lookup.
fn placeholder_needs_gctx(key: &str) -> bool {
    matches!(key, "guild.name")
}

pub(crate) async fn replace_channel_placeholders(
    text: &str,
    guild_id: &GuildId,
    ctx: &Context,
    member: &Member,
) -> Result<String, Error> {
    let re = get_placeholder_regex();

    // Check if the text contains any placeholders that require the GuildCtx
    let mut needs_gctx = false;
    for caps in re.captures_iter(text) {
        if let Some(key_match) = caps.name("key") {
            if placeholder_needs_gctx(key_match.as_str()) {
                needs_gctx = true;
                break;
            }
        }
    }

    // Only query the guild context if it is required by the text template
    let gctx = if needs_gctx {
        Some(get_guild_ctx(*guild_id, ctx).await?)
    } else {
        None
    };

    Ok(
        re.replace_all(text, |caps: &Captures| {
            let key = &caps["key"];

            if let Some(val) = replace_placeholder(gctx.as_ref(), member, key) {
                return val;
            }

            caps[0].to_string()
        }).into_owned()
    )
}