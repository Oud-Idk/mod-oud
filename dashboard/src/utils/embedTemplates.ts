import { BuilderConfig } from "@/types/builder";

export const DEFAULT_CONFIG: BuilderConfig = {
    id: "welcome",
    name: "Welcome Message Builder",
    description: "Configure dynamic arrival embeds for newly joined members.",
    placeholders: [
        // ── Server ──────────────────────────────────────────────────────────
        { key: "server.name", mockValue: "My Server", label: "The name of your server" },
        { key: "server.id", mockValue: "1234567890123456789", label: "The unique ID of your server" },
        {
            key: "server.icon",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "The raw hash code of your server's icon image"
        },
        {
            key: "server.icon_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to your server's icon image"
        },
        { key: "server.owner", mockValue: "@Wolfie", label: "Mentions the owner of your server" },
        { key: "server.owner_id", mockValue: "9876543210987654321", label: "The unique ID of the server owner" },
        { key: "server.member_count", mockValue: "3150", label: "The total number of members in your server" },
        {
            key: "server.verification_level",
            mockValue: "2",
            label: "The security verification level of your server (0 to 4)"
        },
        { key: "server.joined_at", mockValue: "2021-04-01", label: "The date and time the bot joined your server" },

        // ── Member ──────────────────────────────────────────────────────────
        { key: "member.mention", mockValue: "@JaneDoe", label: "Mentions the newly joined member" },
        { key: "member.username", mockValue: "JaneDoe", label: "The username of the new member" },
        { key: "member.id", mockValue: "1122334455667788990", label: "The unique ID of the new member" },
        {
            key: "member.avatar",
            mockValue: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
            label: "The raw hash code of the member's avatar image"
        },
        {
            key: "member.avatar_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to the member's avatar image"
        },
        {
            key: "member.profile_picture",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "An alternate direct link to the member's avatar"
        },
        { key: "member.bot", mockValue: "false", label: "Whether the new member is a bot (true/false)" },
        { key: "member.count", mockValue: "3150", label: "The current total number of server members" },

        // ── Channel ─────────────────────────────────────────────────────────
        { key: "channel.mention", mockValue: "#welcome", label: "Mentions the welcome text channel" },
        { key: "channel.name", mockValue: "welcome", label: "The name of the welcome channel" },
        { key: "channel.id", mockValue: "1122334455667788991", label: "The unique ID of the welcome channel" },
        {
            key: "channel.type",
            mockValue: "0",
            label: "The type of the welcome channel represented as a number (0 to 4)"
        },

        // ── Random ──────────────────────────────────────────────────────────
        { key: "random", mockValue: "7", label: "Generates a random number between 0 and 10" },
        {
            key: "random:x:y",
            mockValue: "42",
            label: "Generates a random number between your custom minimum (x) and maximum (y)"
        },
    ],
};


export const STARBOARD_CONFIG: BuilderConfig = {
    id: "starboard",
    name: "Starboard Builder",
    description: "Configure custom starboard embeds.",
    placeholders: [
        // ── Server ──────────────────────────────────────────────────────────
        { key: "server.name", mockValue: "My Server", label: "The name of your server" },
        { key: "server.id", mockValue: "1234567890123456789", label: "The unique ID of your server" },
        {
            key: "server.icon_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to your server's icon image"
        },
        { key: "server.member_count", mockValue: "3150", label: "The total number of members in your server" },

        // ── Message ─────────────────────────────────────────────────────────
        {
            key: "message.text",
            mockValue: "The quick brown fox jumps over the lazy dog.",
            label: "The original message content"
        },
        {
            key: "message.timestamp",
            mockValue: "January 1st, 1970 at 00:00.",
            label: "The original message content"
        },
        {
            key: "message.stars_count",
            mockValue: "3",
            label: "The reaction count",
        },
        {
            key: "message.link",
            mockValue: "https://discord.com/channels/123456789/987654321/123456789",
            label: "A clickable message link"
        },

        // ── Starboard ───────────────────────────────────────────────────────
        { key: "starboard.emojis", mockValue: "⭐❤️", label: "All starboard reaction emojis" },
        { key: "starboard.first_emoji", mockValue: "⭐", label: "The first starboard reaction emoji" },

        // ── Member ──────────────────────────────────────────────────────────
        { key: "member.mention", mockValue: "@JaneDoe", label: "Mentions the newly joined member" },
        { key: "member.username", mockValue: "JaneDoe", label: "The username of the new member" },
        { key: "member.id", mockValue: "1122334455667788990", label: "The unique ID of the new member" },
        {
            key: "member.avatar_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to the member's avatar image"
        },

        // ── Channel ─────────────────────────────────────────────────────────
        { key: "channel.mention", mockValue: "#welcome", label: "Mentions the welcome text channel" },
        { key: "channel.name", mockValue: "welcome", label: "The name of the welcome channel" },
        { key: "channel.id", mockValue: "1122334455667788991", label: "The unique ID of the welcome channel" },
    ],
};

// Placeholders shared across all moderation_old Direct Messages
const COMMON_PLACEHOLDERS = [
    // ── Server ──────────────────────────────────────────────────────────
    { key: "server.name", mockValue: "My Server", label: "The name of your server" },
    { key: "server.id", mockValue: "1234567890123456789", label: "The unique ID of your server" },
    {
        key: "server.icon_url",
        mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
        label: "A direct link to your server's icon image"
    },

    // ── Member (The user receiving the discipline) ─────────────────────
    { key: "member.username", mockValue: "JaneDoe", label: "The username of the penalized member" },
    { key: "member.id", mockValue: "1122334455667788990", label: "The unique ID of the penalized member" },
    {
        key: "member.avatar_url",
        mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
        label: "A direct link to the member's avatar image"
    },
];

export const WARN_CONFIG: BuilderConfig = {
    id: "warn",
    name: "Warn Message Builder",
    description: "Configure direct messages sent to users when they are warned.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "reason", mockValue: "Spamming in general chat", label: "The reason given for the warning" },
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who issued the warning"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the issuing moderator" },
    ],
};

export const PARDON_WARN_CONFIG: BuilderConfig = {
    id: "pardon_warn",
    name: "Pardon Warn Message Builder",
    description: "Configure direct messages sent to users when their warning is pardoned.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "warn_id", mockValue: "125", label: "The unique ID of the pardoned warning" },
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who pardoned the warning"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the pardoning moderator" },
    ],
};

export const UNPARDON_WARN_CONFIG: BuilderConfig = {
    id: "unpardon_warn",
    name: "Unpardon Warn Message Builder",
    description: "Configure direct messages sent to users when their pardoned warning is reinstated.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "warn_id", mockValue: "125", label: "The unique ID of the reinstated warning" },
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who reinstated the warning"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the reinstating moderator" },
    ],
};

export const UNPARDON_DELETE_WARN_CONFIG: BuilderConfig = {
    id: "unpardon_delete_warn",
    name: "Unpardon + Delete Message Builder",
    description: "Configure direct messages sent to users when a warning is permanently deleted from their record.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "warn_id", mockValue: "125", label: "The unique ID of the deleted warning" },
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who deleted the warning"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the deleting moderator" },
    ],
};

export const MUTE_CONFIG: BuilderConfig = {
    id: "mute",
    name: "Mute Message Builder",
    description: "Configure direct messages sent to users when they are muted.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "reason", mockValue: "Toxic behavior", label: "The reason given for the mute" },
        {
            key: "duration",
            mockValue: "1 hour",
            label: "The length of time the member will be muted (e.g. 1 hour, 7 days)"
        },
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who muted the member"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the muting moderator" },
    ],
};

export const UNMUTE_CONFIG: BuilderConfig = {
    id: "unmute",
    name: "Unmute Message Builder",
    description: "Configure direct messages sent to users when they are unmuted.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who unmuted the member"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the unmuting moderator" },
    ],
};

export const KICK_CONFIG: BuilderConfig = {
    id: "kick",
    name: "Kick Message Builder",
    description: "Configure direct messages sent to users when they are kicked.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "reason", mockValue: "Spamming", label: "The reason given for the kick" },
        { key: "invite.url", mockValue: "https://discord.gg/example", label: "An invite link back to the server" },
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who kicked the member"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the kicking moderator" },
    ],
};

export const BAN_CONFIG: BuilderConfig = {
    id: "ban",
    name: "Ban Message Builder",
    description: "Configure direct messages sent to users when they are banned.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "reason", mockValue: "Exploiting", label: "The reason given for the ban" },
        { key: "appeal_link", mockValue: "https://forms.gle/example", label: "A link to your custom ban appeal form" },
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who banned the member"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the banning moderator" },
    ],
};

export const SOFTBAN_CONFIG: BuilderConfig = {
    id: "softban",
    name: "Softban Message Builder",
    description: "Configure direct messages sent to users when they are softbanned.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "reason", mockValue: "Inappropriate username", label: "The reason given for the softban" },
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: "The username of the moderator who softbanned the member"
        },
        { key: "moderator.id", mockValue: "9876543210987654321", label: "The unique ID of the softbanning moderator" },
    ],
};

export const LEVEL_NOTIFY_CONFIG: BuilderConfig = {
    id: "levels",
    name: "Level Up Message Builder",
    description: "Configure the messages sent when a user levels up.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
        { key: "member.mention", mockValue: "@JaneDoe", label: "Mentions the member who leveled up" },
        { key: "level.current", mockValue: "17", label: "The current level" },
        { key: "level.previous", mockValue: "16", label: "The previous level" },
    ],
};

export const TICKETS_PANEL_CONFIG: BuilderConfig = {
    id: "tickets_panel",
    name: "Tickets Panel Message Builder",
    description: "Configure the greeting message containing the button used to open tickets.",
    placeholders: [
        // ── Server ──────────────────────────────────────────────────────────
        { key: "server.name", mockValue: "My Server", label: "The name of your server" },
        { key: "server.id", mockValue: "1234567890123456789", label: "The unique ID of your server" },
        {
            key: "server.icon_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to your server's icon image"
        },
        { key: "server.member_count", mockValue: "3150", label: "The total number of members in your server" },

        // ── Support Role ───────────────────────────────────────────────────
        { key: "role.mention", mockValue: "@Support Staff", label: "Mentions your configured ticket support role" },
        { key: "role.name", mockValue: "Support Staff", label: "The name of your configured ticket support role" },
        { key: "role.id", mockValue: "1122334455667788992", label: "The unique ID of your ticket support role" },
    ],
};

export const TICKETS_WELCOME_CONFIG: BuilderConfig = {
    id: "tickets_welcome",
    name: "Ticket Welcome Message Builder",
    description: "Configure the message sent inside the newly created ticket channel.",
    placeholders: [
        // ── Member (The Ticket Creator) ────────────────────────────────────
        { key: "member.mention", mockValue: "@JaneDoe", label: "Mentions the member who opened the ticket" },
        { key: "member.username", mockValue: "JaneDoe", label: "The username of the ticket creator" },
        { key: "member.id", mockValue: "1122334455667788990", label: "The unique ID of the ticket creator" },
        {
            key: "member.avatar_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to the ticket creator's avatar"
        },

        // ── Server ──────────────────────────────────────────────────────────
        { key: "server.name", mockValue: "My Server", label: "The name of your server" },
        { key: "server.id", mockValue: "1234567890123456789", label: "The unique ID of your server" },
        {
            key: "server.icon_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to your server's icon image"
        },

        // ── Support Role ───────────────────────────────────────────────────
        { key: "role.mention", mockValue: "@Support Staff", label: "Mentions your configured ticket support role" },
        { key: "role.name", mockValue: "Support Staff", label: "The name of your configured ticket support role" },
        { key: "role.id", mockValue: "1122334455667788992", label: "The unique ID of your ticket support role" },

        // ── Channel (The Ticket Channel) ───────────────────────────────────
        {
            key: "channel.mention",
            mockValue: "#ticket-janedoe",
            label: "Mentions the newly created ticket text channel"
        },
        { key: "channel.name", mockValue: "ticket-janedoe", label: "The name of the ticket channel" },
        { key: "channel.id", mockValue: "1122334455667788991", label: "The unique ID of the ticket channel" },
    ],
};