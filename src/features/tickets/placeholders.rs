use crate::core::config::guild_ctx::GuildCtx;
use crate::shared::placeholders::{DiscordCtx, PlaceholderResolver, ResolverChain, render};
use serenity::all::{GuildChannel, Member, RoleId};

/// Custom resolver for Ticket Panel specific keys (e.g. `{role.mention}`, `{role.name}`)
pub struct TicketResolver<'a> {
    pub role_id: Option<RoleId>,
    pub role_name: Option<&'a str>,
}

impl PlaceholderResolver for TicketResolver<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        match key {
            "role" | "role.mention" | "ticket.role" | "ticket.role.mention" => {
                self.role_id.map(|id| format!("<@&{}>", id))
            }
            "role.id" | "ticket.role.id" => {
                self.role_id.map(|id| id.to_string())
            }
            "role.name" | "ticket.role.name" => {
                self.role_name.map(|s| s.to_string())
            }
            _ => None,
        }
    }
}

pub fn replace_ticket_panel_placeholders(
    text: &str,
    gctx: &GuildCtx,
    role_id: Option<RoleId>,
    role_name: Option<&str>,
) -> String {
    let discord_ctx = DiscordCtx {
        gctx: Some(gctx),
        ..Default::default()
    };

    let ticket_resolver = TicketResolver { role_id, role_name };
    let chain = ResolverChain(vec![&ticket_resolver, &discord_ctx]);

    render(text, &chain)
}

pub fn replace_ticket_welcome_placeholders(
    text: &str,
    gctx: &GuildCtx,
    member: Option<&Member>,
    role_id: Option<&RoleId>,
    role_name: Option<&str>,
    channel: Option<&GuildChannel>,
) -> String {
    // DiscordCtx automatically resolves server, user/member, and channel placeholders!
    let discord_ctx = DiscordCtx {
        gctx: Some(gctx),
        member,
        channel,
        ..Default::default()
    };

    let ticket_resolver = TicketResolver {
        role_id: role_id.copied(),
        role_name,
    };

    let chain = ResolverChain(vec![&ticket_resolver, &discord_ctx]);

    render(text, &chain)
}