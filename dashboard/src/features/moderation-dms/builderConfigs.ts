import { BuilderConfig, COMMON_PLACEHOLDERS } from "@/features/_shared/builderConfig";

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
export const HONEYPOT_CONFIG: BuilderConfig = {
    id: "honeypot",
    name: "Honeypot Actioned Message Builder",
    description: "Configure direct messages sent to users when they are banned from messaging in a honeypot.",
    placeholders: [
        ...COMMON_PLACEHOLDERS,
    ],
};