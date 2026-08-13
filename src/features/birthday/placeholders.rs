use crate::core::config::guild_ctx::GuildCtx;
use crate::features::birthday::format;
use crate::features::birthday::types::BirthdayMember;
use crate::shared::placeholders::{DiscordCtx, PlaceholderResolver, ResolverChain, render};
use chrono::{Datelike, Utc};

/// Custom resolver for Birthday Announcement specific keys
pub struct BirthdayResolver<'a> {
    pub celebrants: &'a [BirthdayMember],
    pub current_year: i32,
}

impl PlaceholderResolver for BirthdayResolver<'_> {
    fn resolve(&self, key: &str) -> Option<String> {
        match key {
            // Mentions: "<@123>, <@456>, and <@789>"
            "users" | "user" => {
                let mentions: Vec<String> = self
                    .celebrants
                    .iter()
                    .map(|m| format!("<@{}>", m.user_id))
                    .collect();
                Some(format::format_natural_list(&mentions))
            }

            // Names: "Alex, Sam, and Jordan"
            "user.names" | "user.name" => {
                let names: Vec<String> = self
                    .celebrants
                    .iter()
                    .map(|m| m.display_name.clone())
                    .collect();
                Some(format::format_natural_list(&names))
            }

            // Total Count: "3"
            "user.count" | "count" => Some(self.celebrants.len().to_string()),

            // Bulleted List with Ordinal Ages (Ideal for Embed descriptions)
            "user.list" => {
                let list: Vec<String> = self
                    .celebrants
                    .iter()
                    .map(|m| {
                        if let Some(year) = m.birth_year {
                            let age = self.current_year - i32::from(year);
                            format!("• <@{}> ({} Birthday!)", m.user_id, format::format_ordinal(age))
                        } else {
                            format!("• <@{}>", m.user_id)
                        }
                    })
                    .collect();
                Some(list.join("\n"))
            }

            // Current Date (e.g., "July 27")
            "date" => {
                let now = Utc::now();
                Some(now.format("%B %e").to_string().replace("  ", " "))
            }

            // Current Four-Digit Year (e.g., "2026")
            "year" => Some(self.current_year.to_string()),

            _ => None,
        }
    }
}

pub fn replace_birthday_placeholders(
    text: &str,
    gctx: &GuildCtx,
    celebrants: &[BirthdayMember],
) -> String {
    let discord_ctx = DiscordCtx {
        gctx: Some(gctx),
        ..Default::default()
    };

    let current_year = Utc::now().year();
    let birthday_resolver = BirthdayResolver {
        celebrants,
        current_year,
    };

    // Chain ensures if a key like {server.name} or {random} is used, DiscordCtx catches it
    let chain = ResolverChain(vec![&birthday_resolver, &discord_ctx]);

    render(text, &chain)
}