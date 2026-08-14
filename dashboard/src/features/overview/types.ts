import { z } from "zod";

const countField = z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((val) => {
        if (val === null || val === undefined) return 0;
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

// --- Discord Guild Details Schema ---
export const DiscordGuildDetailsSchema = z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    approximate_member_count: z.number().optional(),
    approximate_presence_count: z.number().optional(),
});

export type DiscordGuildDetails = z.infer<typeof DiscordGuildDetailsSchema>;