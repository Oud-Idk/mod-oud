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

const fn default_gifting_enabled() -> bool {
    true
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
    /// Whether item gifting between users is enabled.
    #[serde(default = "default_gifting_enabled")]
    pub gifting_enabled: bool,
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
            gifting_enabled: default_gifting_enabled(),
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

/// Which set of an item's actions to run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionTrigger {
    Buy,
    Use,
}

impl ActionTrigger {
    /// Whether `action` fires for this trigger.
    #[must_use]
    pub const fn matches(self, action: &ItemAction) -> bool {
        match self {
            Self::Buy => action.trigger_flags().triggers_on_buy(),
            Self::Use => action.trigger_flags().triggers_on_use(),
        }
    }
}

/// The database-side effects of an item's actions, resolved before a transaction opens.
///
/// Roles and replies are absent on purpose. They are Discord calls that cannot be rolled back,
/// so they run after the transaction commits rather than inside it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ItemDbActions {
    /// Cash to credit the user.
    pub add_cash: i64,
    /// Cash to charge the user.
    pub deduct_cash: i64,
    /// Items to credit, as (`item_id`, `quantity`).
    pub add_items: Vec<(Uuid, i32)>,
    /// Items to charge, as (`item_id`, `quantity`).
    pub remove_items: Vec<(Uuid, i32)>,
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

    /// Parses this item's purchase and use gates.
    ///
    /// # Errors
    /// Returns [`Err`] if the stored JSONB is malformed. Callers must refuse the operation: an
    /// unparseable gate is not the same as no gate, and treating it as one lets a role-locked or
    /// balance-locked item be used for free.
    pub fn parsed_requirements(&self) -> Result<Vec<ItemRequirement>, serde_json::Error> {
        serde_json::from_value(self.requirements.clone())
    }

    /// Parses this item's actions.
    ///
    /// # Errors
    /// Returns [`Err`] if the stored JSONB is malformed. Callers must refuse the operation, or
    /// the item is consumed and grants nothing.
    pub fn parsed_actions(&self) -> Result<Vec<ItemAction>, serde_json::Error> {
        serde_json::from_value(self.actions.clone())
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
}

/// A row in the `economy_inventory` table.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct InventoryRow {
    pub guild_id: GuildId,
    pub user_id: UserId,
    pub item_id: Uuid,
    pub quantity: i32,
}

/// A category for organizing store items.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ItemCategory {
    pub id: Uuid,
    pub guild_id: GuildId,
    pub name: String,
}

/// A plaintext work message template. Relational: multiple per guild, picked at random.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct WorkMessage {
    pub id: Uuid,
    pub guild_id: GuildId,
    pub content: String,
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
