import { Pattern } from "@/types/db/config/messageFiltering";
import { Scope } from "@/types/db/config";

import { ModerationAction } from "@/types";

export interface Warn {
    id: string;
    user_id: string;
    guild_id: string;
    moderator_id: string;
    reason: string;
    created_at: Date;
    isActive: boolean;
}

export interface Ticket {
    id: number;
    channel_id: string;
    opener_id: string;
    status: TicketStatus;
    created_at: string;
    closed_at: string | null;
    message_count: number;
}

export interface ReportedMessage {
    id: number;
    guild_id: string;
    channel_id: string;
    message_id: string;
    author_id: string;
    reporter_id: string;
    content: string;
    attachment_url: string | null;
    reason: string;
    status: ReportStatus;
    moderator_id: string | null;
    moderator_notes: string | null;
    created_at: string;
    resolved_at: string | null;
    message_deleted: boolean;
    user_warned: boolean;
    user_timed_out: boolean;
    user_banned: boolean;
}

export interface TempVoiceHub {
    id: string;
    guild_id: string;
    name: string;
    hub_channel_id: string;
    category_id: string;
    user_limit: number | null;
    interface_channel_id?: string;
    default_channel_name: string;
}

export interface BadWordRuleset {
    id: string;
    guild_id: string;
    name: string;
    enabled: boolean;
    patterns: Pattern[];
    actions: RuleAction[];
    timeout_duration_seconds: number | null;
    scope: Scope;
    created_at: Date;
    updated_at: Date;
}

export interface WarnThreshold {
    id: number;
    guild_id: string;
    warn_count: number;
    action_type: ModerationAction[];
    roles_to_add?: string[];
    roles_to_remove?: string[];
    duration: number | null;
}

export type Format = "EMBED" | "TEXT";
export type SimpleReportStatus = 'ACTIONED' | 'DISMISSED';
export type ReportStatus = 'UNDER_REVIEW' | SimpleReportStatus;
export type TicketStatus = "OPEN" | "CLOSED";
export type ViewTicketStatus = "ALL" | TicketStatus;
export type JoinLeaveAction = "JOIN" | "LEAVE";
export type TargetType = "CHANNEL" | "ROLE";
export type ButtonStyle = "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER";
export type ReactionRoleMode = "REACTION" | "BUTTON";
export type ReminderType = "SINGLE" | "RECURRING";
export type RestrictionType = 'NONE' | 'ALL_EXCEPT' | 'ONLY_THESE';

export type RuleAction =
    | "DELETE"
    | "WARN"
    | "TIMEOUT"
    | "REMIND_PUBLICLY"
    | "REMIND_PRIVATELY";
export type StrategyType = "EXACT" | "SUBSTRING" | "REGEX";
export type FlagThreshold = "MILD" | "MODERATE" | "SEVERE";
export type ScopeListMode = "ALLOWLIST" | "DENYLIST";
export type ScopeActionMode = "EXEMPT" | "ENFORCED";
export type NotificationScope = "CURRENT_CHANNEL" | "SPECIFIED_CHANNEL" | "DM" | "NONE";
export type CaptchaType = 'TURNSTILE' | 'HCAPTCHA';
export type CounterType =
    | 'TOTAL_MEMBERS'
    | 'HUMANS_ONLY'
    | 'BOTS_ONLY'
    | 'ONLINE_MEMBERS'
    | 'ROLE_COUNT';