use crate::core::config::message_layout::MessageLayout;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{EmojiId, GuildId, RoleId, UserId};
use std::collections::HashMap;
use uuid::Uuid;

fn default_work_message() -> String {
    "You earned **{reward} {currency}**!".to_string()
}

const fn default_rob_cooldown() -> i64 {
    3600
}

const fn default_rob_success_rate() -> f64 {
    0.5
}

const fn default_rob_min_percent() -> i64 {
    10
}

const fn default_rob_max_percent() -> i64 {
    30
}

const fn default_rob_min_cash() -> i64 {
    100
}

const fn default_rob_fine_percent() -> i64 {
    10
}

/// Configuration settings specifically for the `/rob` command.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RobConfig {
    /// Cooldown in seconds between `/rob` uses.
    #[serde(default = "default_rob_cooldown")]
    pub cooldown_secs: i64,
    /// Success probability for `/rob` (0.0–1.0).
    #[serde(default = "default_rob_success_rate")]
    pub success_rate: f64,
    /// Minimum percent of the victim's wallet stolen on success.
    #[serde(default = "default_rob_min_percent")]
    pub min_percent: i64,
    /// Maximum percent of the victim's wallet stolen on success.
    #[serde(default = "default_rob_max_percent")]
    pub max_percent: i64,
    /// Minimum wallet cash the victim must have to be robbed.
    #[serde(default = "default_rob_min_cash")]
    pub min_cash: i64,
    /// Percent of robber's wallet lost as a fine on failure.
    #[serde(default = "default_rob_fine_percent")]
    pub fine_percent: i64,
}

impl Default for RobConfig {
    fn default() -> Self {
        Self {
            cooldown_secs: default_rob_cooldown(),
            success_rate: default_rob_success_rate(),
            min_percent: default_rob_min_percent(),
            max_percent: default_rob_max_percent(),
            min_cash: default_rob_min_cash(),
            fine_percent: default_rob_fine_percent(),
        }
    }
}

/// Per-guild economy configuration stored in `GuildSettings`.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EconomyConfig {
    /// Whether the economy system is enabled for this guild.
    pub enabled: bool,
    /// Display name for the currency (e.g. "coins", "dollars").
    pub currency_name: String,
    /// Cooldown in seconds between `/work` uses.
    pub work_cooldown_secs: i64,
    /// Minimum coins earned per `/work` invocation.
    pub work_min_reward: i64,
    /// Maximum coins earned per `/work` invocation.
    pub work_max_reward: i64,
    /// Plaintext template for the `/work` success message. Supports `{reward}` and `{currency}` placeholders.
    #[serde(default = "default_work_message")]
    pub work_message: String,
    /// Initial wallet balance granted to new users on first interaction.
    #[serde(default)]
    pub starting_balance: i64,
    /// Robbery settings.
    #[serde(default)]
    pub rob: RobConfig,
}

impl Default for EconomyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            currency_name: String::new(),
            work_cooldown_secs: 0,
            work_min_reward: 0,
            work_max_reward: 0,
            work_message: default_work_message(),
            starting_balance: 0,
            rob: RobConfig::default(),
        }
    }
}

impl EconomyConfig {
    /// Render the work message by replacing `{reward}` `{currency}` `{user}` placeholders.
    #[must_use]
    pub fn render_work_message(&self, reward: i64, currency: &str) -> String {
        render_work_message_template(&self.work_message, reward, currency, "")
    }

    /// Render with user mention support.
    #[must_use]
    pub fn render_work_message_with_user(
        &self,
        reward: i64,
        currency: &str,
        user_mention: &str,
    ) -> String {
        render_work_message_template(&self.work_message, reward, currency, user_mention)
    }
}

/// A user's economy balance within a guild.
#[derive(Debug, Clone)]
pub struct Balance {
    pub guild_id: GuildId,
    pub user_id: UserId,
    pub cash: i64,
    pub bank: i64,
}

impl Balance {
    /// Total coins across wallet and bank.
    #[must_use]
    pub const fn total(&self) -> i64 {
        self.cash + self.bank
    }

    /// Constructs a `Balance` from raw signed database values.
    #[must_use]
    pub const fn from_raw(guild_id: i64, user_id: i64, cash: i64, bank: i64) -> Self {
        Self {
            guild_id: GuildId::new(guild_id.cast_unsigned()),
            user_id: UserId::new(user_id.cast_unsigned()),
            cash,
            bank,
        }
    }
}

/// How many of the listed targets must match.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MatchType {
    /// User must have ALL listed roles/items.
    #[default]
    Every,
    /// User must have at least ONE of the listed roles/items.
    AtLeastOne,
    /// User must have NONE of the listed roles/items.
    None,
}

/// When a requirement or action fires (bitmask: `1` = BUY, `2` = USE, `3` = BOTH).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(transparent)]
pub struct TriggerFlags(pub u8);

impl TriggerFlags {
    pub const BUY: Self = Self(0b01);
    pub const USE: Self = Self(0b10);

    #[must_use]
    pub const fn triggers_on_buy(self) -> bool {
        self.0 & Self::BUY.0 != 0
    }

    #[must_use]
    pub const fn triggers_on_use(self) -> bool {
        self.0 & Self::USE.0 != 0
    }
}

impl Default for TriggerFlags {
    fn default() -> Self {
        Self::BUY
    }
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(
    tag = "type",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum ItemRequirement {
    Role {
        #[serde(default)]
        match_type: MatchType,
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        #[serde_as(as = "Vec<DisplayFromStr>")]
        role_ids: Vec<RoleId>,
    },
    TotalBalance {
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        balance: i64,
    },
    Item {
        #[serde(default)]
        match_type: MatchType,
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        quantities: HashMap<Uuid, i32>,
    },
}

impl ItemRequirement {
    #[must_use]
    pub const fn trigger_flags(&self) -> TriggerFlags {
        match self {
            Self::Role { trigger_flags, .. }
            | Self::TotalBalance { trigger_flags, .. }
            | Self::Item { trigger_flags, .. } => *trigger_flags,
        }
    }
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(
    tag = "type",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum ItemAction {
    Respond {
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        message: Option<MessageLayout>,
    },
    AddRoles {
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        #[serde_as(as = "Vec<DisplayFromStr>")]
        role_ids: Vec<RoleId>,
    },
    RemoveRoles {
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        #[serde_as(as = "Vec<DisplayFromStr>")]
        role_ids: Vec<RoleId>,
    },
    AddBalance {
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        balance: i64,
    },
    RemoveBalance {
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        balance: i64,
    },
    AddItems {
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        quantities: HashMap<Uuid, i32>,
        #[serde(default)]
        #[serde_as(as = "Vec<DisplayFromStr>")]
        item_ids: Vec<Uuid>,
    },
    RemoveItems {
        #[serde(default)]
        trigger_flags: TriggerFlags,
        #[serde(default)]
        quantities: HashMap<Uuid, i32>,
        #[serde(default)]
        #[serde_as(as = "Vec<DisplayFromStr>")]
        item_ids: Vec<Uuid>,
    },
}

impl ItemAction {
    #[must_use]
    pub const fn trigger_flags(&self) -> TriggerFlags {
        match self {
            Self::Respond { trigger_flags, .. }
            | Self::AddRoles { trigger_flags, .. }
            | Self::RemoveRoles { trigger_flags, .. }
            | Self::AddBalance { trigger_flags, .. }
            | Self::RemoveBalance { trigger_flags, .. }
            | Self::AddItems { trigger_flags, .. }
            | Self::RemoveItems { trigger_flags, .. } => *trigger_flags,
        }
    }
}

/// A store item in the economy system.
#[derive(Debug, Clone)]
pub struct Item {
    pub id: Uuid,
    pub guild_id: GuildId,
    pub name: String,
    pub description: String,
    pub price: i64,
    pub category_id: Option<Uuid>,
    pub emoji_unicode: Option<String>,
    pub emoji_id: Option<String>,
    pub is_inventory: bool,
    pub is_usable: bool,
    pub is_sellable: bool,
    pub is_listed: bool,
    pub unlimited_stock: bool,
    pub stock_remaining: i32,
    pub requirements: serde_json::Value,
    pub actions: serde_json::Value,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl Item {
    /// Returns the typed `EmojiId` if a custom emoji was configured.
    #[must_use]
    pub fn emoji_id(&self) -> Option<EmojiId> {
        self.emoji_id
            .as_deref()
            .and_then(|id| id.parse::<u64>().ok())
            .map(EmojiId::new)
    }

    pub fn parsed_requirements(&self) -> Vec<ItemRequirement> {
        serde_json::from_value(self.requirements.clone()).unwrap_or_else(|err| {
            tracing::warn!("Failed to parse requirements for item {}: {err}", self.id);
            Vec::new()
        })
    }

    pub fn parsed_actions(&self) -> Vec<ItemAction> {
        serde_json::from_value(self.actions.clone()).unwrap_or_else(|err| {
            tracing::warn!("Failed to parse actions for item {}: {err}", self.id);
            Vec::new()
        })
    }

    #[must_use]
    pub fn icon_str(&self) -> Option<String> {
        self.emoji_unicode
            .clone()
            .or_else(|| self.emoji_id.as_ref().map(|id| format!("<:item:{id}>")))
    }

    /// Returns a valid Discord CDN URL if this item has a custom emoji (for embed thumbnails)
    #[must_use]
    pub fn thumbnail_url(&self) -> Option<String> {
        if let Some(id) = &self.emoji_id {
            return Some(format!("https://cdn.discordapp.com/emojis/{id}.png"));
        }

        if let Some(unicode) = &self.emoji_unicode
            && (unicode.starts_with("http://") || unicode.starts_with("https://"))
        {
            return Some(unicode.clone());
        }

        None
    }

    #[allow(clippy::too_many_arguments, clippy::fn_params_excessive_bools)]
    pub const fn from_raw(
        id: Uuid,
        guild_id: i64,
        name: String,
        description: String,
        price: i64,
        category_id: Option<Uuid>,
        emoji_unicode: Option<String>,
        emoji_id: Option<String>,
        is_inventory: bool,
        is_usable: bool,
        is_sellable: bool,
        is_listed: bool,
        unlimited_stock: bool,
        stock_remaining: i32,
        requirements: serde_json::Value,
        actions: serde_json::Value,
        expires_at: Option<DateTime<Utc>>,
        created_at: DateTime<Utc>,
    ) -> Self {
        Self {
            id,
            guild_id: GuildId::new(guild_id.cast_unsigned()),
            name,
            description,
            price,
            category_id,
            emoji_unicode,
            emoji_id,
            is_inventory,
            is_usable,
            is_sellable,
            is_listed,
            unlimited_stock,
            stock_remaining,
            requirements,
            actions,
            expires_at,
            created_at,
        }
    }
}

/// A row in the `economy_inventory` table.
#[derive(Debug, Clone)]
pub struct InventoryRow {
    pub guild_id: GuildId,
    pub user_id: UserId,
    pub item_id: Uuid,
    pub quantity: i32,
}

/// A category for organizing store items.
#[derive(Debug, Clone)]
pub struct ItemCategory {
    pub id: Uuid,
    pub guild_id: GuildId,
    pub name: String,
    pub description: String,
    pub position: i32,
    pub emoji_unicode: Option<String>,
    pub emoji_id: Option<String>,
}

impl ItemCategory {
    #[must_use]
    pub fn emoji_id(&self) -> Option<EmojiId> {
        self.emoji_id
            .as_deref()
            .and_then(|id| id.parse::<u64>().ok())
            .map(EmojiId::new)
    }
}

/// A plaintext work message template. Relational: multiple per guild, picked at random.
#[derive(Debug, Clone)]
pub struct WorkMessage {
    pub id: Uuid,
    pub guild_id: GuildId,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

impl WorkMessage {
    /// Render placeholders `{reward}` `{currency}` `{user}` (plaintext).
    #[must_use]
    #[allow(clippy::literal_string_with_formatting_args)]
    pub fn render(&self, reward: i64, currency: &str, user_mention: &str) -> String {
        self.content
            .replace("{reward}", &reward.to_string())
            .replace("{currency}", currency)
            .replace("{user}", user_mention)
    }
}

/// Helper for rendering work messages when no relational rows exist (fallback to config).
#[allow(clippy::literal_string_with_formatting_args)]
pub fn render_work_message_template(
    template: &str,
    reward: i64,
    currency: &str,
    user_mention: &str,
) -> String {
    let tmpl = if template.trim().is_empty() {
        default_work_message()
    } else {
        template.to_string()
    };

    tmpl.replace("{reward}", &reward.to_string())
        .replace("{currency}", currency)
        .replace("{user}", user_mention)
}
