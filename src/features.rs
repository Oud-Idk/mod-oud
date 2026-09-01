//! Feature modules. Each feature is a self-contained unit exposing a public
//! contract (commands, event handlers, routes, config) via its root file.

/// Automod and rule enforcement.
pub mod automod;
/// Bad-word filtering.
pub mod bad_words;
/// Birthday announcements.
pub mod birthday;
/// Custom commands.
pub mod custom_commands;
/// Virtual economy (cash, bank, work).
pub mod economy;
/// General utility commands.
pub mod general;
/// Giveaways.
pub mod giveaways;
/// Invite tracking.
pub mod invite_tracking;
/// Join/leave notifications.
pub mod join_leave;
/// Leveling and XP.
pub mod leveling;
/// Live feed.
pub mod live_feed;
/// Media-only channels.
pub mod media_only;
/// Member counter.
pub mod member_counter;
/// Message logging.
pub mod message_logging;
/// Moderation actions and punishments.
pub mod moderation;
/// Music playback.
pub mod music;
/// Raid detection.
pub mod raid_detection;
/// Reaction roles.
pub mod reaction_roles;
/// Reminders.
pub mod reminder;
/// Reporting system.
pub mod reporting;
/// Anime search system.
pub mod search;
/// Starboard for message highlights.
pub mod starboard;
/// Temporary voice channels.
pub mod temp_voice;
/// Ticket system.
pub mod tickets;
/// Membership verification.
pub mod verification;
/// Warning system.
pub mod warning;
/// Gambling mechanics for economy.
pub mod gambling;
