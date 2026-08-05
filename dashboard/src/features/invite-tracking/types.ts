import { z } from "zod";

export const inviteTrackerConfigSchema = z.object({
    enabled: z.boolean().default(false),
});

export const leaderboardEntrySchema = z.object({
    inviterId: z.string(),
    count: z.number().int().min(0),
});


export const getLeaderboardInputSchema = z.object({
    guildId: z.string().min(1),
    limit: z.number().int().positive().default(15),
    offset: z.number().int().nonnegative().default(0),
});

export type InviteTrackerConfig = z.infer<typeof inviteTrackerConfigSchema>;
export const defaultInviteTrackerConfig: InviteTrackerConfig = inviteTrackerConfigSchema.parse({});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;