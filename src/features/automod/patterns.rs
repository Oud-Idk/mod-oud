use std::sync::LazyLock;
use regex::Regex;

pub static DISCORD_FORMAT_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<(?:a?:[a-zA-Z0-9_]+:|@&?|#)\d+>").unwrap());
pub static INVITE_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)(discord\.(gg|io|me|li|com/invite|app\.com/invite))/([a-zA-Z0-9\-]+)").unwrap());
pub static DISCORD_EMOJI_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<(a?):(\w+):(\d+)>").unwrap());
pub static DISCORD_PING_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<@[!&]?[0-9]{17,20}>|@(everyone|here)").unwrap());
