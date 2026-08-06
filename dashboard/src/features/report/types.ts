
import { DiscordEmbed, Format } from "@/features/_shared/embed";

export type SimpleReportAction = 'ACTIONED' | 'DISMISSED';
export type ReportAction = 'UNDER_REVIEW' | SimpleReportAction;
export type TimeUnit = "MINUTES" | "HOURS" | "DAYS";

export interface MessageLayout {
    enabled: boolean;
    format: Format;
    content: string;
    embed: DiscordEmbed;
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
    status: ReportAction;
    moderator_id: string | null;
    moderator_notes: string | null;
    created_at: string;
    resolved_at: string | null;
    message_deleted: boolean;
    user_warned: boolean;
    user_timed_out: boolean;
    user_banned: boolean;
}

export interface ReportConfig {
    enabled: boolean;
    reportingChannel?: string | null;
    resolvedDm: MessageLayout;
    dismissedDm: MessageLayout;
}

