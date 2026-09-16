use crate::core::config::message_layout::MessageLayout as CustomMessagePayload;
use crate::core::config::settings::GuildSettings;
use serde::{Deserialize, Serialize};
use serenity::all::{ChannelId, GuildId, RoleId, UserId};
use sqlx::types::Json;

/// Default prefix used when a guild has no custom prefix configured.
pub const DEFAULT_PREFIX: &str = "!";
/// Maximum number of characters allowed in a custom prefix.
pub const MAX_PREFIX_LEN: usize = 3;
/// Characters that are never allowed in a prefix (mentions, channels, code blocks, paths).
const FORBIDDEN_PREFIX_CHARS: [char; 6] = ['<', '>', '@', '#', '`', '/'];

/// Per-guild configuration for custom commands, stored under the
/// `custom_commands` key in `GuildSettings`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CustomCommandsConfig {
    /// Trigger prefix for custom commands (e.g. `"!"`, `"?"`).
    pub prefix: String,
}

impl Default for CustomCommandsConfig {
    fn default() -> Self {
        Self {
            prefix: DEFAULT_PREFIX.to_string(),
        }
    }
}

impl CustomCommandsConfig {
    /// Returns the effective prefix, falling back to [`DEFAULT_PREFIX`] when empty.
    #[must_use]
    pub fn effective_prefix(&self) -> &str {
        if self.prefix.is_empty() {
            DEFAULT_PREFIX
        } else {
            &self.prefix
        }
    }

    /// Validates and normalizes a raw prefix candidate.
    ///
    /// # Errors
    /// Returns a human-readable error when the prefix is empty, too long,
    /// contains whitespace or alphanumeric characters, or uses a forbidden character.
    pub fn validate_prefix(raw: &str) -> Result<String, &'static str> {
        let prefix = raw.trim();
        if prefix.is_empty() {
            return Err("Prefix must not be empty.");
        }
        let len = prefix.chars().count();
        if len > MAX_PREFIX_LEN {
            return Err("Prefix must be at most 3 characters.");
        }
        if prefix.chars().any(char::is_whitespace) {
            return Err("Prefix must not contain whitespace.");
        }
        if prefix.chars().any(char::is_alphanumeric) {
            return Err("Prefix must not contain letters or numbers.");
        }
        if prefix.chars().any(|c| FORBIDDEN_PREFIX_CHARS.contains(&c)) {
            return Err("Prefix must not contain <, >, @, #, ` or /.");
        }
        Ok(prefix.to_string())
    }
}

/// Resolves the effective custom-command prefix for a guild.
#[must_use]
pub fn resolve_prefix(settings: &GuildSettings) -> &str {
    settings
        .custom_commands
        .as_deref()
        .map(CustomCommandsConfig::effective_prefix)
        .unwrap_or(DEFAULT_PREFIX)
}

/// Strips the trigger (`@mention` or `prefix`) from message content.
///
/// Mention prefixes (`<@id>` / `<@!id>`) take precedence over the text prefix.
/// Returns the remainder after the trigger, or `None` when neither matches.
#[must_use]
pub fn strip_custom_prefix<'a>(
    content: &'a str,
    prefix: &str,
    bot_id: Option<UserId>,
) -> Option<&'a str> {
    if let Some(id) = bot_id {
        for mention in [format!("<@{id}>"), format!("<@!{id}>")] {
            if let Some(rest) = content.strip_prefix(mention.as_str()) {
                return Some(rest.trim_start());
            }
        }
    }
    content.strip_prefix(prefix)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(
    type_name = "COMMAND_COOLDOWN_TYPE",
    rename_all = "SCREAMING_SNAKE_CASE"
)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CooldownType {
    None,
    User,
    Server,
}

/// Dedicated sub-field for all message execution layout & logic
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct MessageLayout {
    pub messages: Vec<CustomMessagePayload>,
    pub randomize: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum CommandAction {
    SendChannelMessage {
        channel_id: String,
        message_layout: MessageLayout,
    },
    RespondCurrentChannel {
        is_dm: bool,
        is_ephemeral: bool,
        message_layout: MessageLayout,
    },
    AddRole {
        role_id: String,
    },
    RemoveRole {
        role_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomCommand {
    pub id: i64,
    pub guild_id: GuildId,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub delete_trigger: bool,
    pub cooldown_type: CooldownType,
    pub cooldown_seconds: i32,
    pub allowed_roles: Vec<RoleId>,
    pub ignored_roles: Vec<RoleId>,
    pub allowed_channels: Vec<ChannelId>,
    pub ignored_channels: Vec<ChannelId>,
    pub actions: Json<Vec<CommandAction>>,
}

#[derive(sqlx::FromRow)]
pub struct CustomCommandRow {
    pub id: i64,
    pub guild_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub delete_trigger: bool,
    pub cooldown_type: CooldownType,
    pub cooldown_seconds: i32,
    pub allowed_roles: Vec<i64>,
    pub ignored_roles: Vec<i64>,
    pub allowed_channels: Vec<i64>,
    pub ignored_channels: Vec<i64>,
    pub actions: Json<Vec<CommandAction>>,
}

impl From<CustomCommandRow> for CustomCommand {
    fn from(row: CustomCommandRow) -> Self {
        Self {
            id: row.id,
            guild_id: GuildId::new(row.guild_id.cast_unsigned()),
            name: row.name,
            description: row.description,
            enabled: row.enabled,
            delete_trigger: row.delete_trigger,
            cooldown_type: row.cooldown_type,
            cooldown_seconds: row.cooldown_seconds,
            allowed_roles: row
                .allowed_roles
                .into_iter()
                .map(|id| RoleId::new(id.cast_unsigned()))
                .collect(),
            ignored_roles: row
                .ignored_roles
                .into_iter()
                .map(|id| RoleId::new(id.cast_unsigned()))
                .collect(),
            allowed_channels: row
                .allowed_channels
                .into_iter()
                .map(|id| ChannelId::new(id.cast_unsigned()))
                .collect(),
            ignored_channels: row
                .ignored_channels
                .into_iter()
                .map(|id| ChannelId::new(id.cast_unsigned()))
                .collect(),
            actions: row.actions,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_common_symbols() {
        for valid in ["!", "?", ".", "-", "+", "$", "%", "!!", "!?", "??"] {
            assert_eq!(
                CustomCommandsConfig::validate_prefix(valid).as_deref(),
                Ok(valid)
            );
        }
    }

    #[test]
    fn validate_trims_surrounding_whitespace() {
        assert_eq!(
            CustomCommandsConfig::validate_prefix("  ?  ").as_deref(),
            Ok("?")
        );
    }

    #[test]
    fn validate_rejects_bad_input() {
        assert!(CustomCommandsConfig::validate_prefix("").is_err());
        assert!(CustomCommandsConfig::validate_prefix("   ").is_err());
        assert!(CustomCommandsConfig::validate_prefix("!!!!").is_err());
        assert!(CustomCommandsConfig::validate_prefix("! cmd").is_err());
        assert!(CustomCommandsConfig::validate_prefix("a").is_err());
        assert!(CustomCommandsConfig::validate_prefix("1").is_err());
        assert!(CustomCommandsConfig::validate_prefix("!a").is_err());
        for forbidden in ["<", ">", "@", "#", "`", "/"] {
            assert!(
                CustomCommandsConfig::validate_prefix(forbidden).is_err(),
                "{forbidden} should be rejected"
            );
        }
    }

    #[test]
    fn effective_prefix_falls_back_when_empty() {
        let cfg = CustomCommandsConfig {
            prefix: String::new(),
        };
        assert_eq!(cfg.effective_prefix(), DEFAULT_PREFIX);
        let cfg = CustomCommandsConfig {
            prefix: "?".to_string(),
        };
        assert_eq!(cfg.effective_prefix(), "?");
    }

    #[test]
    fn resolve_prefix_defaults_without_config() {
        let settings = GuildSettings::default();
        assert_eq!(resolve_prefix(&settings), DEFAULT_PREFIX);
    }

    #[test]
    fn resolve_prefix_uses_configured_value() {
        let settings = GuildSettings {
            custom_commands: Some(Box::new(CustomCommandsConfig {
                prefix: "?".to_string(),
            })),
            ..GuildSettings::default()
        };
        assert_eq!(resolve_prefix(&settings), "?");
    }

    #[test]
    fn strip_prefers_mention_over_text_prefix() {
        let bot_id = UserId::new(123);
        assert_eq!(
            strip_custom_prefix("<@123>hello", "!", Some(bot_id)),
            Some("hello")
        );
        assert_eq!(
            strip_custom_prefix("<@!123>  hello", "!", Some(bot_id)),
            Some("hello")
        );
        assert_eq!(
            strip_custom_prefix("!hello", "!", Some(bot_id)),
            Some("hello")
        );
        assert_eq!(strip_custom_prefix("?hello", "!", Some(bot_id)), None);
        assert_eq!(strip_custom_prefix("!hello", "!", None), Some("hello"));
        assert_eq!(strip_custom_prefix("<@123>hello", "!", None), None);
    }
}
