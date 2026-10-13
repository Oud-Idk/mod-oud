import { BuilderConfig, COMMON_PLACEHOLDERS, Placeholder } from "@/features/_shared/builderConfig";

// Every config below shares the same scaffold; only the identity and the
// feature-specific placeholders vary.
function builderConfig(
    id: string,
    name: string,
    description: string,
    placeholders: Placeholder[],
): BuilderConfig {
    return { id, name, description, placeholders: [...COMMON_PLACEHOLDERS, ...placeholders] };
}

// Every moderation action carries the same reason placeholder; only the
// example text and the noun vary ("for the kick", "for the ban").
function reasonPlaceholder(mockValue: string, noun: string): Placeholder {
    return { key: "reason", mockValue, label: `The reason given for the ${noun}` };
}

// Every moderation action is attributed the same way; only the verb and its
// target vary ("who muted the member" / "of the muting moderator").
function moderatorPlaceholders(past: string, gerund: string, target: string): Placeholder[] {
    return [
        {
            key: "moderator.username",
            mockValue: "ModWolfie",
            label: `The username of the moderator who ${past} ${target}`,
        },
        {
            key: "moderator.id",
            mockValue: "9876543210987654321",
            label: `The unique ID of the ${gerund} moderator`,
        },
    ];
}

export const WARN_CONFIG: BuilderConfig = builderConfig(
    "warn",
    "Warn Message Builder",
    "Configure direct messages sent to users when they are warned.",
    [
        reasonPlaceholder("Spamming in general chat", "warning"),
        ...moderatorPlaceholders("issued", "issuing", "the warning"),
    ],
);

export const PARDON_WARN_CONFIG: BuilderConfig = builderConfig(
    "pardon_warn",
    "Pardon Warn Message Builder",
    "Configure direct messages sent to users when their warning is pardoned.",
    [
        { key: "warn_id", mockValue: "125", label: "The unique ID of the pardoned warning" },
        ...moderatorPlaceholders("pardoned", "pardoning", "the warning"),
    ],
);

export const UNPARDON_WARN_CONFIG: BuilderConfig = builderConfig(
    "unpardon_warn",
    "Unpardon Warn Message Builder",
    "Configure direct messages sent to users when their pardoned warning is reinstated.",
    [
        { key: "warn_id", mockValue: "125", label: "The unique ID of the reinstated warning" },
        ...moderatorPlaceholders("reinstated", "reinstating", "the warning"),
    ],
);

export const UNPARDON_DELETE_WARN_CONFIG: BuilderConfig = builderConfig(
    "unpardon_delete_warn",
    "Unpardon + Delete Message Builder",
    "Configure direct messages sent to users when a warning is permanently deleted from their record.",
    [
        { key: "warn_id", mockValue: "125", label: "The unique ID of the deleted warning" },
        ...moderatorPlaceholders("deleted", "deleting", "the warning"),
    ],
);

export const MUTE_CONFIG: BuilderConfig = builderConfig(
    "mute",
    "Mute Message Builder",
    "Configure direct messages sent to users when they are muted.",
    [
        reasonPlaceholder("Toxic behavior", "mute"),
        {
            key: "duration",
            mockValue: "1 hour",
            label: "The length of time the member will be muted (e.g. 1 hour, 7 days)"
        },
        ...moderatorPlaceholders("muted", "muting", "the member"),
    ],
);

export const UNMUTE_CONFIG: BuilderConfig = builderConfig(
    "unmute",
    "Unmute Message Builder",
    "Configure direct messages sent to users when they are unmuted.",
    [
        ...moderatorPlaceholders("unmuted", "unmuting", "the member"),
    ],
);

export const KICK_CONFIG: BuilderConfig = builderConfig(
    "kick",
    "Kick Message Builder",
    "Configure direct messages sent to users when they are kicked.",
    [
        reasonPlaceholder("Spamming", "kick"),
        { key: "invite.url", mockValue: "https://discord.gg/example", label: "An invite link back to the server" },
        ...moderatorPlaceholders("kicked", "kicking", "the member"),
    ],
);

export const BAN_CONFIG: BuilderConfig = builderConfig(
    "ban",
    "Ban Message Builder",
    "Configure direct messages sent to users when they are banned.",
    [
        reasonPlaceholder("Exploiting", "ban"),
        { key: "appeal_link", mockValue: "https://forms.gle/example", label: "A link to your custom ban appeal form" },
        ...moderatorPlaceholders("banned", "banning", "the member"),
    ],
);

export const SOFTBAN_CONFIG: BuilderConfig = builderConfig(
    "softban",
    "Softban Message Builder",
    "Configure direct messages sent to users when they are softbanned.",
    [
        reasonPlaceholder("Inappropriate username", "softban"),
        ...moderatorPlaceholders("softbanned", "softbanning", "the member"),
    ],
);

export const HONEYPOT_CONFIG: BuilderConfig = builderConfig(
    "honeypot",
    "Honeypot Actioned Message Builder",
    "Configure direct messages sent to users when they are banned from messaging in a honeypot.",
    [],
);
