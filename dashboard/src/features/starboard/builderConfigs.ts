import { BuilderConfig, CHANNEL_PLACEHOLDERS, SERVER_PLACEHOLDERS } from "@/features/_shared/builderConfig";

export const STARBOARD_CONFIG: BuilderConfig = {
    id: "starboard",
    name: "Starboard Builder",
    description: "Configure custom starboard embeds.",
    placeholders: [
        ...CHANNEL_PLACEHOLDERS,
        ...SERVER_PLACEHOLDERS,

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
            mockValue: "My Server > 🗨️",
            label: "A clickable message link"
        },
        {
            key: "message.first_attachment",
            mockValue: "https://cdn.discordapp.com/attachments/1490289680124608554/1495041524285706421/MootnBoiInspiredOne.avif?ex=6a7480eb&is=6a732f6b&hm=5e9f8f11eebfa164ed04e08e72a44a920a0a20d4f6609844fda3ad172472b8f2&",
            label: "The first attachment of a given message, if any.",
        },

        { key: "starboard.emojis", mockValue: "⭐❤️", label: "All starboard reaction emojis" },
        { key: "starboard.first_emoji", mockValue: "⭐", label: "The first starboard reaction emoji" },

        { key: "member.mention", mockValue: "@JaneDoe", label: "Mentions the newly joined member" },
        { key: "member.username", mockValue: "JaneDoe", label: "The username of the new member" },
        { key: "member.id", mockValue: "1122334455667788990", label: "The unique ID of the new member" },
        {
            key: "member.avatar_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to the member's avatar image"
        },

    ],
};