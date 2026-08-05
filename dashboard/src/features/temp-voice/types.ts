import { z } from "zod";

export const tempVoiceHubSchema = z.object({
    id: z.string(),
    guild_id: z.string(),
    name: z.string(),
    hub_channel_id: z.string(),
    category_id: z.string(),
    user_limit: z.number().nullable(),
    interface_channel_id: z.string().nullish(),
    default_channel_name: z.string(),
});

export type TempVoiceHub = z.infer<typeof tempVoiceHubSchema>;

const emptyStringToNull = z.preprocess(
    (val) => (val === "" || val === undefined ? null : val),
    z.string().nullish()
);

export const saveTempVoiceHubInputSchema = tempVoiceHubSchema
    .omit({ id: true })
    .extend({
        id: z.preprocess(
            (val) => (val === "" || val === undefined ? null : val),
            z.string().nullable()
        ),
        interface_channel_id: emptyStringToNull,
    })
    .partial({
        name: true,
        user_limit: true,
    });

export type SaveTempVoiceHubInput = z.infer<typeof saveTempVoiceHubInputSchema>;
