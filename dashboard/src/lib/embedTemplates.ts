import { BuilderConfig } from "@/types/builder";

export const WELCOME_CONFIG: BuilderConfig = {
    id: "welcome",
    name: "Welcome Message Builder",
    description: "Configure dynamic arrival embeds for newly joined members.",
    placeholders: [
        // ── Server ──────────────────────────────────────────────────────────
        { key: "server.name", mockValue: "Smiley & Wolfie's Hub", label: "The name of your server" },
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

