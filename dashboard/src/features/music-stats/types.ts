import { z } from "zod";

export const trackStatSchema = z.object({
    title: z.string(),
    artist: z.string(),
    trackUrl: z.string().nullable(),
    plays: z.coerce.number().int().nonnegative(),
    totalListenedMs: z.coerce.number().int().nonnegative(),
});

export const listenerStatSchema = z.object({
    userId: z.string(),
    plays: z.coerce.number().int().nonnegative(),
    totalListenedMs: z.coerce.number().int().nonnegative(),
});

export const musicStatsSummarySchema = z.object({
    totalPlays: z.coerce.number().int().nonnegative(),
    totalListenedMs: z.coerce.number().int().nonnegative(),
    uniqueTracks: z.coerce.number().int().nonnegative(),
    uniqueListeners: z.coerce.number().int().nonnegative(),
});

export type TrackStat = z.infer<typeof trackStatSchema>;
export type ListenerStat = z.infer<typeof listenerStatSchema>;
export type MusicStatsSummary = z.infer<typeof musicStatsSummarySchema>;
