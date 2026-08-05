export interface Placeholder {
    key: string;
    mockValue: string;
    label: string;
}

export interface BuilderConfig {
    id: string;
    name: string;
    description: string;
    accentColor?: string;
    placeholders: Placeholder[];
}

export const SERVER_PLACEHOLDERS = [
    { key: "server.name", mockValue: "My Server", label: "The name of your server" },
    { key: "server.id", mockValue: "1234567890123456789", label: "The unique ID of your server" },
    {
        key: "server.icon_url",
        mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
        label: "A direct link to your server's icon image"
    },
    { key: "server.member_count", mockValue: "3150", label: "The total number of members in your server" },
]

export const CHANNEL_PLACEHOLDERS = [
    { key: "channel.mention", mockValue: "#welcome", label: "Mentions the welcome text channel" },
    { key: "channel.name", mockValue: "welcome", label: "The name of the welcome channel" },
    { key: "channel.id", mockValue: "1122334455667788991", label: "The unique ID of the welcome channel" },
]

export const MEMBER_PLACEHOLDERS = [
    { key: "member.username", mockValue: "JaneDoe", label: "The username of the penalized member" },
    { key: "member.id", mockValue: "1122334455667788990", label: "The unique ID of the penalized member" },
    {
        key: "member.avatar_url",
        mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
        label: "A direct link to the member's avatar image"
    },
    { key: "member.mention", mockValue: "@JaneDoe", label: "Mentions the newly joined member" },
    { key: "member.bot", mockValue: "false", label: "Whether the new member is a bot (true/false)" },
]

export const COMMON_PLACEHOLDERS = [
    ...SERVER_PLACEHOLDERS,
    ...MEMBER_PLACEHOLDERS,
];


