import { BuilderConfig, CHANNEL_PLACEHOLDERS, SERVER_PLACEHOLDERS } from "@/features/_shared/builderConfig";

export const GIVEAWAY_TEMPLATE_CONFIG: BuilderConfig = {
    id: "giveaways",
    name: "Giveaway Message Builder",
    description: "Configure dynamic announcement embeds for community giveaways.",
    placeholders: [
        ...SERVER_PLACEHOLDERS,
        ...CHANNEL_PLACEHOLDERS,

        { key: "prize", mockValue: "1 Year Discord Nitro", label: "The prize being given away" },
        { key: "winners", mockValue: "1", label: "The total number of winners" },
        {
            key: "end_time",
            mockValue: "<t:1784970000:R>",
            label: "Formatted relative Discord timestamp showing when the giveaway ends"
        },

        { key: "host.mention", mockValue: "@Oud", label: "Mentions the host of the giveaway" },
        { key: "host.username", mockValue: "Oud", label: "The username of the giveaway host" },
        { key: "host.id", mockValue: "9876543210987654321", label: "The unique ID of the giveaway host" },
        {
            key: "host.avatar_url",
            mockValue: "https://cdn.discordapp.com/embed/avatars/0.png",
            label: "A direct link to the host's avatar image"
        },
    ],
};