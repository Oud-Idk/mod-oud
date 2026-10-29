import { z } from "zod";

const countField = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((val) => {
        const parsed = Number(val);
        return Number.isNaN(parsed) ? 0 : parsed;
    });

export const RawGuildStatsSchema = z.object({
    weekly_moderation: countField,
    weekly_resolved: countField,
    open_tickets: countField,
});

export const GuildStatsSchema = z.object({
    weeklyModerationCount: z.number().default(0),
    weeklyResolvedTicketCount: z.number().default(0),
    openTicketsCount: z.number().default(0),
});

export type GuildStats = z.infer<typeof GuildStatsSchema>;

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
