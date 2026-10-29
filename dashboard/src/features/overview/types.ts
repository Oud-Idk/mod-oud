import { z } from "zod";

const countField = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((val) => {
        const parsed = Number(val);
        return Number.isNaN(parsed) ? 0 : parsed;
    });

export const RawWeeklyStatsSchema = z.object({
    joins_current: countField,
    joins_previous: countField,
    leaves_current: countField,
    leaves_previous: countField,
    moderation_current: countField,
    moderation_previous: countField,
    automod_current: countField,
    automod_previous: countField,
    tickets_current: countField,
    tickets_previous: countField,
});

export type RawWeeklyStats = z.infer<typeof RawWeeklyStatsSchema>;

export type StatCardId = "member_growth" | "moderation" | "automod" | "tickets";

export interface StatCardItem {
    id: StatCardId;
    title: string;
    value: string;
    delta: string;
}

export const DiscordGuildDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    approximate_member_count: z.number().optional(),
    approximate_presence_count: z.number().optional(),
});

export type DiscordGuildDetails = z.infer<typeof DiscordGuildDetailsSchema>;
export const DatabaseTelemetrySchema = z.object({
    healthy: z.boolean(),
    latency_ms: z.number().nullable().optional(),
});

export const RedisTelemetrySchema = z.object({
    healthy: z.boolean(),
    latency_ms: z.number().nullable().optional(),
});

export const MemoryTelemetrySchema = z.object({
    bot_mb: z.number().nullable().optional(),
    ml_mb: z.number().nullable().optional(),
});

export const ShardTelemetrySchema = z.object({
    shard_id: z.number(),
    total_shards: z.number(),
    gateway_latency_ms: z.number().nullable().optional(),
});

export const TelemetryReportSchema = z.object({
    database: DatabaseTelemetrySchema,
    redis: RedisTelemetrySchema,
    memory: MemoryTelemetrySchema,
    shard: ShardTelemetrySchema.nullable().optional(),
});
/** The `details` JSONB on `raid_event_logs`. Every key is optional because each event type writes a different shape. */
export const RaidEventDetailsSchema = z.object({
    message: z.string().optional(),
    moderator: z.string().optional(),
    manual: z.boolean().optional(),
});

export type IncidentKind = "MODERATION" | "AUTOMOD" | "RAID" | "TICKET";

export interface RecentIncidentItem {
    id: string;
    kind: IncidentKind;
    title: string;
    details: string;
    actor: string | null;
    target: string | null;
    createdAt: Date;
    href: string;
}

export interface FeatureStatusItem {
    id: string;
    name: string;
    category: "Moderation & Security" | "Engagement & Fun" | "Utility & Tools" | "Onboarding";
    href: string;
    enabled: boolean;
    description: string;
}

export interface FeatureMatrixCategory {
    title: string;
    features: FeatureStatusItem[];
}


export type TelemetryReport = z.infer<typeof TelemetryReportSchema>;

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RawMemberFlowRowSchema = z.object({
    day: dayKey,
    joins: countField,
    leaves: countField,
});

export const RawModerationActivityRowSchema = z.object({
    day: dayKey,
    action_type: z.string().nullable(),
    count: countField,
});

export const RawAutomodBreakdownRowSchema = z.object({
    rule_type: z.string(),
    count: countField,
});

export type RawModerationActivityRow = z.infer<typeof RawModerationActivityRowSchema>;

/** `day` is a UTC calendar date, `YYYY-MM-DD`. */
export interface MemberFlowPoint {
    day: string;
    joins: number;
    leaves: number;
}

export const MODERATION_SERIES = ["bans", "kicks", "mutes", "warns", "other"] as const;
export type ModerationSeries = (typeof MODERATION_SERIES)[number];

export type ModerationActivityPoint = { day: string } & Record<ModerationSeries, number>;

export interface AutomodBreakdownItem {
    rule: string;
    count: number;
}

export const RawActiveRaidRowSchema = z.object({
    raid_start_time: z.coerce.date(),
});

export interface ActiveRaid {
    startedAt: Date;
}

export const RawAttentionCountsSchema = z.object({
    open_tickets: countField,
    oldest_open_ticket_at: z.coerce.date().nullable(),
    giveaways_ending: countField,
    next_giveaway_end_at: z.coerce.date().nullable(),
    temp_bans_expiring: countField,
    next_unban_at: z.coerce.date().nullable(),
    failing_reminders: countField,
});

export type RawAttentionCounts = z.infer<typeof RawAttentionCountsSchema>;

export type AttentionKind = "OPEN_TICKETS" | "GIVEAWAYS_ENDING" | "TEMP_BANS_EXPIRING" | "FAILING_REMINDERS";

export interface AttentionItem {
    kind: AttentionKind;
    title: string;
    detail: string;
    href: string;
}

export interface ActivityChartData {
    memberFlow: MemberFlowPoint[];
    moderation: ModerationActivityPoint[];
    automod: AutomodBreakdownItem[];
}
