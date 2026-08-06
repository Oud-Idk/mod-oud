import { z } from "zod";
import { DiscordEmbed, Format } from "@/features/_shared/embed";

const formatSchema = z.custom<Format>((val) => typeof val === "string");
const discordEmbedSchema = z.custom<DiscordEmbed>((val) => typeof val === "object" && val !== null);

export const giveawaySchema = z.object({
    id: z.coerce.number().int(),
    guild_id: z.string(),
    host_id: z.string(),
    channel_id: z.string().nullish(),
    message_id: z.string().nullish(),
    prize: z.string().min(1, "Prize is required"),
    winner_count: z.coerce.number().int().min(1, "Winner count must be at least 1").default(1),
    end_time: z.union([z.string(), z.date()]).transform((val) =>
        val instanceof Date ? val.toISOString() : val
    ),
    is_finished: z.boolean().default(false),
    format: formatSchema,
    embed: discordEmbedSchema.optional(),
    content: z.string().nullish(),
});

export type Giveaway = z.infer<typeof giveawaySchema>;

export const saveGiveawayInputSchema = giveawaySchema
    .omit({ is_finished: true })
    .extend({
        id: z.coerce.number().int().positive().optional(),
        channel_id: z.string().nullish(),
        message_id: z.string().nullish(),
        embed: discordEmbedSchema.optional(),
        content: z.string().nullish(),
    });

export type SaveGiveawayData = z.infer<typeof saveGiveawayInputSchema>;

export const sendGiveawayInputSchema = z.object({
    guildId: z.string().min(1, "Guild ID is required"),
    id: z.coerce.number().int().positive("Giveaway ID must be a positive integer"),
});

export const sendGiveawayResponseSchema = z.object({
    message_id: z.string(),
});

export type SendGiveawayResponse = z.infer<typeof sendGiveawayResponseSchema>;