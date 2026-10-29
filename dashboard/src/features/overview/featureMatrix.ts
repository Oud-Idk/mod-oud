import { FeatureMatrixCategory } from "./types";

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

export function buildFeatureCategories(p: FeatureMatrixBuildParams): FeatureMatrixCategory[] {
    return [
        {
            title: "Moderation & Security",
            features: [
                {
                    id: "message-filtering",
                    name: "Automod Filtering",
                    category: "Moderation & Security",
                    href: `/dashboard/${p.guildId}/message-filtering`,
                    enabled: p.mfEnabled,
                    description: p.mfEnabled ? `${p.mfActiveCount.toString()} active rule${p.mfActiveCount === 1 ? "" : "s"}` : "Disabled",
                },
                {
                    id: "anti-raid",
                    name: "Anti-Raid",
                    category: "Moderation & Security",
                    href: `/dashboard/${p.guildId}/anti-raid`,
                    enabled: p.antiRaidEnabled,
                    description: p.antiRaidEnabled ? "Active protection" : "Disabled",
                },
                {
                    id: "dynamic-slowmode",
                    name: "Dynamic Slowmode",
                    category: "Moderation & Security",
                    href: `/dashboard/${p.guildId}/dynamic-slowmode`,
                    enabled: p.dynSlowmodeEnabled,
                    description: p.dynSlowmodeEnabled ? "Adaptive traffic rate" : "Disabled",
                },
                {
                    id: "honeypot",
                    name: "Honeypot Channel",
                    category: "Moderation & Security",
                    href: `/dashboard/${p.guildId}/honeypot`,
                    enabled: p.honeypotEnabled,
                    description: p.honeypotEnabled ? "Trap channel active" : "Not configured",
                },
                {
                    id: "report",
                    name: "User Reporting",
                    category: "Moderation & Security",
                    href: `/dashboard/${p.guildId}/report`,
                    enabled: p.reportEnabled,
                    description: p.reportEnabled ? "Reporting enabled" : "Disabled",
                },
                {
                    id: "message-logging",
                    name: "Message Logging",
                    category: "Moderation & Security",
                    href: `/dashboard/${p.guildId}/message-logging`,
                    enabled: p.msgLoggingEnabled,
                    description: p.msgLoggingEnabled ? "Logging edits & purges" : "Disabled",
                },
                {
                    id: "moderation-dm",
                    name: "Moderation DMs",
                    category: "Moderation & Security",
                    href: `/dashboard/${p.guildId}/moderation-dm`,
                    enabled: p.modDmsEnabled,
                    description: p.modDmsEnabled ? "DM notifications sent" : "Disabled",
                },
            ],
        },
        {
            title: "Engagement & Fun",
            features: [
                {
                    id: "leveling",
                    name: "Leveling & XP",
                    category: "Engagement & Fun",
                    href: `/dashboard/${p.guildId}/leveling`,
                    enabled: p.levelingEnabled,
                    description: p.levelingEnabled ? "Tracking text XP" : "Disabled",
                },
                {
                    id: "starboard",
                    name: "Starboards",
                    category: "Engagement & Fun",
                    href: `/dashboard/${p.guildId}/starboard`,
                    enabled: p.starboardsCount > 0,
                    description: p.starboardsCount > 0 ? `${p.starboardsCount.toString()} board${p.starboardsCount === 1 ? "" : "s"} active` : "None configured",
                },
                {
                    id: "reaction-roles",
                    name: "Reaction Roles",
                    category: "Engagement & Fun",
                    href: `/dashboard/${p.guildId}/reaction-roles`,
                    enabled: p.reactionRolesCount > 0,
                    description: p.reactionRolesCount > 0 ? `${p.reactionRolesCount.toString()} message${p.reactionRolesCount === 1 ? "" : "s"}` : "None configured",
                },
                {
                    id: "giveaways",
                    name: "Giveaways",
                    category: "Engagement & Fun",
                    href: `/dashboard/${p.guildId}/giveaways`,
                    enabled: p.giveawaysCount > 0,
                    description: p.giveawaysCount > 0 ? `${p.giveawaysCount.toString()} giveaway${p.giveawaysCount === 1 ? "" : "s"}` : "No active giveaways",
                },
                {
                    id: "economy",
                    name: "Economy",
                    category: "Engagement & Fun",
                    href: `/dashboard/${p.guildId}/economy`,
                    enabled: p.economyEnabled,
                    description: p.economyEnabled ? "Virtual economy active" : "Disabled",
                },
                {
                    id: "gambling",
                    name: "Gambling",
                    category: "Engagement & Fun",
                    href: `/dashboard/${p.guildId}/gambling`,
                    enabled: p.gamblingEnabled,
                    description: p.gamblingEnabled ? "Casino games active" : "Disabled",
                },
                {
                    id: "birthdays",
                    name: "Birthdays",
                    category: "Engagement & Fun",
                    href: `/dashboard/${p.guildId}/birthdays`,
                    enabled: p.birthdayEnabled,
                    description: p.birthdayEnabled ? "Celebrations active" : "Disabled",
                },
            ],
        },
        {
            title: "Utility & Tools",
            features: [
                {
                    id: "custom-commands",
                    name: "Custom Commands",
                    category: "Utility & Tools",
                    href: `/dashboard/${p.guildId}/custom-commands`,
                    enabled: p.customCmdsCount > 0,
                    description: p.customCmdsCount > 0 ? `${p.customCmdsCount.toString()} command${p.customCmdsCount === 1 ? "" : "s"}` : "None created",
                },
                {
                    id: "tickets",
                    name: "Support Tickets",
                    category: "Utility & Tools",
                    href: `/dashboard/${p.guildId}/tickets`,
                    enabled: p.ticketsEnabled,
                    description: p.ticketsEnabled ? "Ticket system active" : "Not configured",
                },
                {
                    id: "member-counter",
                    name: "Member Counter",
                    category: "Utility & Tools",
                    href: `/dashboard/${p.guildId}/member-counter`,
                    enabled: p.memberCounterEnabled,
                    description: p.memberCounterEnabled ? "Voice stats channel live" : "Disabled",
                },
                {
                    id: "reminders",
                    name: "Reminders",
                    category: "Utility & Tools",
                    href: `/dashboard/${p.guildId}/reminders`,
                    enabled: p.remindersCount > 0,
                    description: p.remindersCount > 0 ? `${p.remindersCount.toString()} reminder${p.remindersCount === 1 ? "" : "s"}` : "None scheduled",
                },
                {
                    id: "rss",
                    name: "RSS Feeds",
                    category: "Utility & Tools",
                    href: `/dashboard/${p.guildId}/rss`,
                    enabled: p.rssCount > 0,
                    description: p.rssCount > 0 ? `${p.rssCount.toString()} feed${p.rssCount === 1 ? "" : "s"} subscribed` : "No feeds",
                },
                {
                    id: "temp-voice",
                    name: "Temporary Voice",
                    category: "Utility & Tools",
                    href: `/dashboard/${p.guildId}/temp-voice`,
                    enabled: p.tempVoiceCount > 0,
                    description: p.tempVoiceCount > 0 ? `${p.tempVoiceCount.toString()} hub${p.tempVoiceCount === 1 ? "" : "s"} active` : "None configured",
                },
                {
                    id: "media-only",
                    name: "Media Only Channels",
                    category: "Utility & Tools",
                    href: `/dashboard/${p.guildId}/media-only`,
                    enabled: p.mediaOnlyCount > 0,
                    description: p.mediaOnlyCount > 0 ? `${p.mediaOnlyCount.toString()} channel${p.mediaOnlyCount === 1 ? "" : "s"}` : "None restricted",
                },
                {
                    id: "invite-tracking",
                    name: "Invite Tracking",
                    category: "Utility & Tools",
                    href: `/dashboard/${p.guildId}/invite-tracking`,
                    enabled: p.inviteTrackingEnabled,
                    description: p.inviteTrackingEnabled ? "Logging invite origins" : "Disabled",
                },
            ],
        },
        {
            title: "Onboarding",
            features: [
                {
                    id: "welcome",
                    name: "Welcome Messages",
                    category: "Onboarding",
                    href: `/dashboard/${p.guildId}/welcome`,
                    enabled: p.welcomeEnabled,
                    description: p.welcomeEnabled ? "Greeting new members" : "Disabled",
                },
                {
                    id: "verification",
                    name: "Verification Gate",
                    category: "Onboarding",
                    href: `/dashboard/${p.guildId}/verification`,
                    enabled: p.verificationEnabled,
                    description: p.verificationEnabled ? "Captcha gate active" : "Disabled",
                },
                {
                    id: "leave",
                    name: "Leave Messages",
                    category: "Onboarding",
                    href: `/dashboard/${p.guildId}/leave`,
                    enabled: p.leaveEnabled,
                    description: p.leaveEnabled ? "Logging departing members" : "Disabled",
                },
            ],
        },
    ];
}
