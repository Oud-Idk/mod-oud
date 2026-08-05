import {
    BuilderConfig,
    CHANNEL_PLACEHOLDERS,
    COMMON_PLACEHOLDERS,
    SERVER_PLACEHOLDERS
} from "@/features/_shared/builderConfig";

export const TICKETS_PANEL_CONFIG: BuilderConfig = {
    id: "tickets_panel",
    name: "Tickets Panel Message Builder",
    description: "Configure the greeting message containing the button used to open tickets.",
    placeholders: [
        ...SERVER_PLACEHOLDERS,
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
        ...COMMON_PLACEHOLDERS,
        ...CHANNEL_PLACEHOLDERS,
        { key: "role.mention", mockValue: "@Support Staff", label: "Mentions your configured ticket support role" },
        { key: "role.name", mockValue: "Support Staff", label: "The name of your configured ticket support role" },
        { key: "role.id", mockValue: "1122334455667788992", label: "The unique ID of your ticket support role" },
    ],
};