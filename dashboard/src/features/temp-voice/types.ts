import { z } from "zod";

export const tempVoiceHubSchema = z.object({
    id: z.string(),
    guild_id: z.string(),
    name: z.string().default("New Hub"),
    hub_channel_id: z.string().nullish().default(null),
    category_id: z.string().nullish().default(null),
    user_limit: z.number().nullish().default(null),
    interface_channel_id: z.string().nullish().default(null),
    default_channel_name: z.string().default("{user.display_name}'s Lounge"),
});

export const saveTempVoiceHubInputSchema = z
    .object({
        id: z
            .string()
            .nullish()
            .default(null)
            .transform((val) => (typeof val === "string" && val.trim() === "" ? null : val)),
        guild_id: z.string().min(1, "Guild ID is required"),
        name: z.string().min(1, "Hub name is required"),
        hub_channel_id: z.string().nullish().default(null),
        category_id: z.string().nullish().default(null),
        user_limit: z.number().nullish().default(null),
        interface_channel_id: z.string().nullish().default(null),
        default_channel_name: z.string().min(1, "Default channel name is required"),
    })
    .superRefine((data, ctx) => {
        if (data.hub_channel_id === null || data.hub_channel_id.trim() === "") {
            ctx.addIssue({
                code: 'custom',
                message: "Please select a trigger voice channel.",
                path: ["hub_channel_id"],
            });
        }

        if (data.category_id === null || data.category_id.trim() === "") {
            ctx.addIssue({
                code: 'custom',
                message: "Please select a parent category.",
                path: ["category_id"],
            });
        }
    });

export const setupTempVoicePayloadSchema = z.object({
    categoryName: z.string().min(1, "Category name cannot be empty").max(100),
    hubChannelName: z.string().min(1, "Hub channel name cannot be empty").max(100),
});

export const backendSetupResponseSchema = z.object({
    category_id: z.string(),
    hub_channel_id: z.string(),
    interface_channel_id: z.string().nullish().default(null),
});

export type TempVoiceHub = z.infer<typeof tempVoiceHubSchema>;
export type SaveTempVoiceHubInput = z.input<typeof saveTempVoiceHubInputSchema>;
export type SaveableTempVoiceHub = z.infer<typeof saveTempVoiceHubInputSchema>;
export type SetupTempVoicePayload = z.infer<typeof setupTempVoicePayloadSchema>;

export interface SetupTempVoiceResponse {
    categoryId?: string;
    interfaceChannelId?: string;
    hubChannelId?: string;
}