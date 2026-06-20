import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { WelcomeConfig } from "@/types/config/welcome";
import { ModerationDMsConfig } from "@/types/config/moderationDMs";

export interface Scope {
    mode: "exempt" | "enforced";
    roles: string[];
    channels: string[];
}

export interface LeaveConfig {
    enabled: boolean;
    channel_id: string;
    format: "embed" | "text";
    content: string;
    embed: string;
}

export interface MessageLoggingConfig {
    enabled: boolean;
    ignored_channels: string[];
    ignored_roles: string[];
    ignored_users: string[];
    events: {
        message_delete: boolean;
        message_edit: boolean;
    };
}

interface Range {
    min: number;
    max: number;
}

export interface TextSettings {
    enabled: boolean;
    xp_cooldown: number;
    xp_range: Range;
    xp_on_tickets: boolean;
}

export interface VoiceSettings {
    enabled: boolean;
    xp_range: Range;
}

export interface NotificationSettings {
    scope: "current_channel" | "specified_channel" | "dm" | "none";
    channel_id?: string;

    format: "embed" | "text";
    content: string;
    embed: string;
}

export interface LevelingConfig {
    text: TextSettings;
    voice: VoiceSettings;
    scope: Scope;
    notify: NotificationSettings;

    level_cap: number;
    keep_level_on_leave: boolean;
}

export interface ReportConfig {
    enabled: boolean;
    reporting_channel?: string;
    resolved_dm: MessageLayout;
    dismissed_dm: MessageLayout;
}

export interface MessageLayout {
    enabled: boolean;
    format: "embed" | "text";
    content: string;
    embed: string;
}

export interface TicketConfig {
    category_id: string;
    channel_id: string;
    posted_message_id?: string;
    ticket_role_id: string;

    enabled: boolean;
    format: "embed" | "text";
    content: string;
    embed: string;

    warn_threshold: number;
    delete_threshold: number;
    bump_every: number;

    welcome_message: MessageLayout;
}

export interface Config {
    welcome: WelcomeConfig;
    leave: LeaveConfig;
    message_logging: MessageLoggingConfig;
    message_filtering: MessageFilteringConfig;
    leveling: LevelingConfig;
    report: ReportConfig;
    moderation_dms: ModerationDMsConfig;
    tickets: TicketConfig;
}