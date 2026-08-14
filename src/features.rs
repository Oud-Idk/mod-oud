//! Feature modules. Each feature is a self-contained unit exposing a public
//! contract (commands, event handlers, routes, config) via its root file.

/// Moderation actions and punishments.
pub mod moderation;
/// Warning system.
pub mod warning;
/// Starboard for message highlights.
pub mod starboard;
/// Automod and rule enforcement.
pub mod automod;
/// Bad-word filtering.
pub mod bad_words;
/// Reaction roles.
pub mod reaction_roles;
/// Invite tracking.
pub mod invite_tracking;
/// Message logging.
pub mod message_logging;
/// Ticket system.
pub mod tickets;
/// Temporary voice channels.
pub mod temp_voice;
/// Join/leave notifications.
pub mod join_leave;
/// Leveling and XP.
pub mod leveling;
/// Membership verification.
pub mod verification;
/// General utility commands.
pub mod general;
/// Reporting system.
pub mod reporting;
/// Member counter.
pub mod member_counter;
/// Live feed.
pub mod live_feed;
/// Reminders.
pub mod reminder;
/// Giveaways.
pub mod giveaways;
/// Custom commands.
pub mod custom_commands;
/// Birthday announcements.
pub mod birthday;
/// Raid detection.
pub mod raid_detection;
/// Media-only channels.
pub mod media_only;
/// Music playback.
pub mod music;