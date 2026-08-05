import { BuilderConfig, SERVER_PLACEHOLDERS } from "@/features/_shared/builderConfig";

export const BIRTHDAY_TEMPLATE_CONFIG: BuilderConfig = {
    id: "birthdays",
    name: "Birthday Announcement Builder",
    description: "Configure automatic birthday messages for your members.",
    placeholders: [
        ...SERVER_PLACEHOLDERS,

        { key: "users", mockValue: "@Alex, @Sam, and @Jordan", label: "Mention(s) of today's birthday member(s)" },
        {
            key: "user.names",
            mockValue: "Alex, Sam, and Jordan",
            label: "Display name(s) of today's birthday member(s)"
        },
        { key: "user.count", mockValue: "3", label: "Total number of members celebrating today" },
        {
            key: "user.list",
            mockValue: "• @Alex (25th Birthday!)\n• @Sam (18th Birthday!)\n• @Jordan",
            label: "Bulleted list of celebrants (Includes ages if known; ideal for Embed descriptions)"
        },

        { key: "date", mockValue: "July 27", label: "Current date formatted (e.g. July 27)" },
        { key: "year", mockValue: "2026", label: "Current four-digit year" },
    ],
};