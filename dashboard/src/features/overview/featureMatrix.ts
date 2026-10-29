import { FeatureMatrixCategory, FeatureStatusItem } from "./types";

export interface FeatureMatrixBuildParams {
    guildId: string;
    mfEnabled: boolean;
    mfActiveCount: number;
    antiRaidEnabled: boolean;
    dynSlowmodeEnabled: boolean;
    honeypotEnabled: boolean;
    reportEnabled: boolean;
    msgLoggingEnabled: boolean;
    modDmsEnabled: boolean;
    levelingEnabled: boolean;
    starboardsCount: number;
    reactionRolesCount: number;
    giveawaysCount: number;
    economyEnabled: boolean;
    gamblingEnabled: boolean;
    birthdayEnabled: boolean;
    customCmdsCount: number;
    ticketsEnabled: boolean;
    memberCounterEnabled: boolean;
    remindersCount: number;
    rssCount: number;
    tempVoiceCount: number;
    mediaOnlyCount: number;
    inviteTrackingEnabled: boolean;
    welcomeEnabled: boolean;
    verificationEnabled: boolean;
    leaveEnabled: boolean;
}

type FeatureItem = FeatureMatrixCategory["features"][number];

function createFeature(
    guildId: string,
    category: "Moderation & Security" | "Engagement & Fun" | "Utility & Tools" | "Onboarding",
    id: string,
    name: string,
    enabled: boolean,
    description: string
): FeatureItem {
    return {
        id,
        name,
        category,
        href: `/dashboard/${guildId}/${id}`,
        enabled,
        description,
    };
}

function formatCountDesc(count: number, singular: string, emptyText: string, suffix = ""): string {
    if (count <= 0) {
        return emptyText;
    }
    const label = `${count.toString()} ${singular}${count === 1 ? "" : "s"}`;
    return suffix !== "" ? `${label} ${suffix}` : label;
}

function buildModerationCategory(p: FeatureMatrixBuildParams): FeatureMatrixCategory {
    const title = "Moderation & Security";
    const item = (id: string, name: string, enabled: boolean, desc: string): FeatureStatusItem =>
        createFeature(p.guildId, title, id, name, enabled, desc);

    const mfDescription = p.mfEnabled
        ? `${p.mfActiveCount.toString()} active rule${p.mfActiveCount === 1 ? "" : "s"}`
        : "Disabled";

    return {
        title,
        features: [
            item("message-filtering", "Automod Filtering", p.mfEnabled, mfDescription),
            item("anti-raid", "Anti-Raid", p.antiRaidEnabled, p.antiRaidEnabled ? "Active protection" : "Disabled"),
            item("dynamic-slowmode", "Dynamic Slowmode", p.dynSlowmodeEnabled, p.dynSlowmodeEnabled ? "Adaptive traffic rate" : "Disabled"),
            item("honeypot", "Honeypot Channel", p.honeypotEnabled, p.honeypotEnabled ? "Trap channel active" : "Not configured"),
            item("report", "User Reporting", p.reportEnabled, p.reportEnabled ? "Reporting enabled" : "Disabled"),
            item("message-logging", "Message Logging", p.msgLoggingEnabled, p.msgLoggingEnabled ? "Logging edits & purges" : "Disabled"),
            item("moderation-dm", "Moderation DMs", p.modDmsEnabled, p.modDmsEnabled ? "DM notifications sent" : "Disabled"),
        ],
    };
}

function buildEngagementCategory(p: FeatureMatrixBuildParams): FeatureMatrixCategory {
    const title = "Engagement & Fun";
    const item = (id: string, name: string, enabled: boolean, desc: string): FeatureStatusItem =>
        createFeature(p.guildId, title, id, name, enabled, desc);

    return {
        title,
        features: [
            item("leveling", "Leveling & XP", p.levelingEnabled, p.levelingEnabled ? "Tracking text XP" : "Disabled"),
            item("starboard", "Starboards", p.starboardsCount > 0, formatCountDesc(p.starboardsCount, "board", "None configured", "active")),
            item("reaction-roles", "Reaction Roles", p.reactionRolesCount > 0, formatCountDesc(p.reactionRolesCount, "message", "None configured")),
            item("giveaways", "Giveaways", p.giveawaysCount > 0, formatCountDesc(p.giveawaysCount, "giveaway", "No active giveaways")),
            item("economy", "Economy", p.economyEnabled, p.economyEnabled ? "Virtual economy active" : "Disabled"),
            item("gambling", "Gambling", p.gamblingEnabled, p.gamblingEnabled ? "Casino games active" : "Disabled"),
            item("birthdays", "Birthdays", p.birthdayEnabled, p.birthdayEnabled ? "Celebrations active" : "Disabled"),
        ],
    };
}

function buildUtilityCategory(p: FeatureMatrixBuildParams): FeatureMatrixCategory {
    const title = "Utility & Tools";
    const item = (id: string, name: string, enabled: boolean, desc: string): FeatureStatusItem =>
        createFeature(p.guildId, title, id, name, enabled, desc);

    return {
        title,
        features: [
            item("custom-commands", "Custom Commands", p.customCmdsCount > 0, formatCountDesc(p.customCmdsCount, "command", "None created")),
            item("tickets", "Support Tickets", p.ticketsEnabled, p.ticketsEnabled ? "Ticket system active" : "Not configured"),
            item("member-counter", "Member Counter", p.memberCounterEnabled, p.memberCounterEnabled ? "Voice stats channel live" : "Disabled"),
            item("reminders", "Reminders", p.remindersCount > 0, formatCountDesc(p.remindersCount, "reminder", "None scheduled")),
            item("rss", "RSS Feeds", p.rssCount > 0, formatCountDesc(p.rssCount, "feed", "No feeds", "subscribed")),
            item("temp-voice", "Temporary Voice", p.tempVoiceCount > 0, formatCountDesc(p.tempVoiceCount, "hub", "None configured", "active")),
            item("media-only", "Media Only Channels", p.mediaOnlyCount > 0, formatCountDesc(p.mediaOnlyCount, "channel", "None restricted")),
            item("invite-tracking", "Invite Tracking", p.inviteTrackingEnabled, p.inviteTrackingEnabled ? "Logging invite origins" : "Disabled"),
        ],
    };
}

function buildOnboardingCategory(p: FeatureMatrixBuildParams): FeatureMatrixCategory {
    const title = "Onboarding";
    const item = (id: string, name: string, enabled: boolean, desc: string): FeatureStatusItem =>
        createFeature(p.guildId, title, id, name, enabled, desc);

    return {
        title,
        features: [
            item("welcome", "Welcome Messages", p.welcomeEnabled, p.welcomeEnabled ? "Greeting new members" : "Disabled"),
            item("verification", "Verification Gate", p.verificationEnabled, p.verificationEnabled ? "Captcha gate active" : "Disabled"),
            item("leave", "Leave Messages", p.leaveEnabled, p.leaveEnabled ? "Logging departing members" : "Disabled"),
        ],
    };
}

export function buildFeatureCategories(p: FeatureMatrixBuildParams): FeatureMatrixCategory[] {
    return [
        buildModerationCategory(p),
        buildEngagementCategory(p),
        buildUtilityCategory(p),
        buildOnboardingCategory(p),
    ];
}