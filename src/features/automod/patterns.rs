use regex::Regex;
use std::sync::LazyLock;

pub static DISCORD_EMOJI_MENTION_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(?:a?:[a-zA-Z0-9_]+:|@&?|#)\d+>").expect("Invalid RegEx for Mentions and Emojis")
});
pub static INVITE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(discord\.(gg|io|me|li|com/invite|app\.com/invite))/([a-zA-Z0-9\-]+)")
        .expect("Invalid RegEx for invites")
});
pub static DISCORD_EMOJI_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<(a?):(\w+):(\d+)>").expect("Invalid RegEx for Emojis"));
pub static DISCORD_PING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<@[!&]?[0-9]{17,20}>|@(everyone|here)").expect("Invalid RegEx for Discord pings")
});
