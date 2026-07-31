import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
import { WelcomeConfig } from "@/types/db/config/welcome";
import { ModerationDMsConfig } from "@/types/db/config/moderationDMs";
import { DiscordEmbed } from "@/types/embed";
import { CounterType, Format, NotificationScope, ScopeActionMode } from "@/types/db";

export interface Scope {
    mode: ScopeActionMode;
    roles: string[];
    channels: string[];
}

export interface LeaveConfig {
    enabled: boolean;
    channelId: string;
    format: Format;
    content: string;
    embed: DiscordEmbed;
}

export interface MessageLoggingConfig {
    ignored_channels: string[];
    ignoredRoles: string[];
    ignoredUsers: string[];
    events: {
        messageDelete: boolean;
        messageEdit: boolean;
    };
}

interface Range {
    min: number;
    max: number;
}

export interface TextSettings {
    enabled: boolean;
    xpCooldown: number;
    xpRange: Range;
    xpOnTickets: boolean;
}

export interface VoiceSettings {
    enabled: boolean;
    xpRange: Range;
}

export interface NotificationSettings {
    scope: NotificationScope;
    channelId?: string;
    format: Format;
    content: string;
    embed: DiscordEmbed;
}

export interface ImageCardSettings {
    textColor: string;
    barForegroundColor: string;
    barBackgroundColor: string;
    accentColor: string;
    lineSeparatorColor: string;
    usernameColor: string;
    statisticsColor: string;
    backgroundColor: string;
}

export interface LevelingConfig {
    text: TextSettings;
    voice: VoiceSettings;
    scope: Scope;
    notify: NotificationSettings;
    imageCard: ImageCardSettings;

    levelCap: number;
    keepLevelOnLeave: boolean;
}

export interface ReportConfig {
    enabled: boolean;
    reportingChannel?: string;
    resolvedDm: MessageLayout;
    dismissedDm: MessageLayout;
}

export interface MessageLayout {
    enabled: boolean;
    format: Format;
    content: string;
    embed: DiscordEmbed;
}

export interface TicketConfig {
    categoryId: string;
    channelId: string;
    postedMessageId?: string;
    ticketRoleId: string;

    enabled: boolean;
    format: Format;
    content: string;
    embed: DiscordEmbed;

    warnThreshold: number;
    deleteThreshold: number;
    bumpEvery: number;

    welcomeMessage: MessageLayout;
}

export interface TempVoiceConfig {
    hubChannelId: string;
    categoryId: string;
    defaultLimit: number;
    defaultName: string;
}

export interface HoneypotConfig {
    enabled: boolean;
    channelId: string;
    exemptRoles: string[];
    dmd: number;
    reason: string;
    duration: number | null;
}

export type RaidActionKind =
    | "ALERT"
    | "LOCKDOWN_SERVER"
    | "PAUSE_INVITES"
    | "BUMP_VERIFICATION"
    | "AUTO_BAN_NEW_ACCOUNTS"
    | "TIMEOUT_NEW_JOINS";

export type RaidAction =
    | { type: 'LOCKDOWN_SERVER' }
    | { type: 'BUMP_VERIFICATION' }
    | { type: 'PAUSE_INVITES'; hour: number }
    | { type: 'ALERT'; channelId: string }
    | { type: 'TIMEOUT_NEW_JOINS'; mins: number }
    | { type: 'AUTO_BAN_NEW_ACCOUNTS'; maxAgeHours: number };

export interface RaidDetectionConfig {
    enabled: boolean;
    zScoreMultiplier: number;
    minSafeLimit: number;
    windowSizeSeconds: number;
    raidActions: RaidAction[];
}

export interface CounterChannel {
    id: string;
    channelId: string;
    counterType: CounterType;
    roleId?: string;
    nameTemplate: string;
}

export interface MemberCounterConfig {
    enabled: boolean;
    updateIntervalMinutes: number;
    counters: CounterChannel[];
}

// Not used but made here for consistency
export interface Config {
    welcome?: WelcomeConfig;
    leave?: LeaveConfig;
    messageLogging?: MessageLoggingConfig;
    messageFiltering?: MessageFilteringConfig;
    leveling?: LevelingConfig;
    report?: ReportConfig;
    moderationDms?: ModerationDMsConfig;
    tickets?: TicketConfig;
    tempVoice?: TempVoiceConfig;
}
