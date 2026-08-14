import { z } from "zod";
import { messageLayoutSchema, MessageLayout, IsoDateSchema } from "@/features/_shared/embed";

export const DEFAULT_GIVEAWAY_MESSAGE: MessageLayout = Object.freeze({
    enabled: true,
    format: "TEXT",
    content: "🎉 **GIVEAWAY** 🎉\nPrize: **{prize}**\nClick the button below to enter!",
    embed: {},
});

export const giveawaySchema = z.object({
    id: z.coerce.number().int(),
    guild_id: z.string(),
    host_id: z.string(),
    channel_id: z.string().nullish().default(null),
    message_id: z.string().nullish().default(null),

    prize: z.string().min(1, "Prize description is required"),
    winner_count: z.coerce.number().int().min(1, "Winner count must be at least 1").default(1),
    end_time: IsoDateSchema,
    is_finished: z.boolean().default(false),

    message: messageLayoutSchema.default(DEFAULT_GIVEAWAY_MESSAGE),
});

export type Giveaway = z.infer<typeof giveawaySchema>;

export const saveGiveawayInputSchema = giveawaySchema
    .omit({ is_finished: true })
    .extend({
        id: z.coerce.number().int().positive().optional(),
        channel_id: z.string().nullish().default(null),
        message_id: z.string().nullish().optional().default(null),
        message: messageLayoutSchema.default(DEFAULT_GIVEAWAY_MESSAGE),
    });

export type SaveGiveawayData = z.infer<typeof saveGiveawayInputSchema>;

// Strict Save Validation Schema
export const SaveGiveawaySchema = saveGiveawayInputSchema.superRefine((data, ctx) => {
    if (!data.prize || data.prize.trim() === "") {
        ctx.addIssue({
            code: 'custom',
            message: "Prize description is required!",
            path: ["prize"],
        });
    }

    if (!data.channel_id) {
        ctx.addIssue({
            code: 'custom',
            message: "Please select a target Discord channel for the giveaway!",
            path: ["channel_id"],
        });
    }

    if (data.winner_count < 1) {
        ctx.addIssue({
            code: 'custom',
            message: "Winner count must be at least 1!",
            path: ["winner_count"],
        });
    }
});

export const sendGiveawayInputSchema = z.object({
    guildId: z.string().min(1, "Guild ID is required"),
    id: z.coerce.number().int().positive("Giveaway ID must be a positive integer"),
});

export const sendGiveawayResponseSchema = z.object({
    message_id: z.string(),
});

export type SendGiveawayResponse = z.infer<typeof sendGiveawayResponseSchema>;