import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
import { WelcomeConfig } from "@/types/db/config/welcome";
import { ModerationDMsConfig } from "@/types/db/config/moderationDMs";
import { DiscordEmbed } from "@/types/embed";
import { Format, NotificationScope, ScopeActionMode } from "@/types/db";

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
    enabled: boolean;
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

export interface LevelingConfig {
    text: TextSettings;
    voice: VoiceSettings;
    scope: Scope;
    notify: NotificationSettings;

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