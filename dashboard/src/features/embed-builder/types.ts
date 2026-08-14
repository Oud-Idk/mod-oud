import { z } from "zod";
import { DiscordEmbedSchema, isEmbedEmpty } from "@/features/_shared/embed";

export const GuildIdSchema = z.string().min(1, "Guild ID is required");

export const SendEmbedPayloadSchema = z
    .object({
        channelId: z.string().min(1, "Channel ID is required"),
        embedState: DiscordEmbedSchema,
    })
    .superRefine((data, ctx) => {
        if (isEmbedEmpty(data.embedState)) {
            ctx.addIssue({
                code: 'custom',
                message: "Embed must have at least a title, description, or visible content!",
                path: ["embedState"],
            });
        }
    });

export const SendEmbedResponseSchema = z.object({
    messageId: z.string().optional(),
});

export type SendEmbedPayload = z.infer<typeof SendEmbedPayloadSchema>;
export type SendEmbedResponse = z.infer<typeof SendEmbedResponseSchema>;