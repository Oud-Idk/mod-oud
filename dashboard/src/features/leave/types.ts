import { z } from "zod";
import { DiscordEmbed, Format } from "@/features/_shared/embed";

const formatSchema = z.custom<Format>((val) => typeof val === "string");
const discordEmbedSchema = z.custom<DiscordEmbed>((val) => typeof val === "object" && val !== null);

export const leaveConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().default(""),
    format: formatSchema.default("EMBED"),
    content: z.string().default(""),
    embed: discordEmbedSchema.default({}),
});

export type LeaveConfig = z.infer<typeof leaveConfigSchema>;
export const defaultLeaveConfig: LeaveConfig = leaveConfigSchema.parse({});