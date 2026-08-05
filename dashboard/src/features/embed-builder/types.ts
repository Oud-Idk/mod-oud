import { z } from "zod";
import { DiscordEmbed } from "@/features/_shared/embed";

export const GuildIdSchema = z.string().min(1, "Guild ID is required");
export const SendEmbedPayloadSchema = z.object({
    channelId: z.string().min(1, "Channel ID is required"),
    embedState: z.custom<DiscordEmbed>(),
});
export type SendEmbedPayload = z.infer<typeof SendEmbedPayloadSchema>;

export interface SendEmbedResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}