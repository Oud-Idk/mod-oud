import { z } from "zod";
import { BaseMessageLayoutSchema, isEmbedEmpty, } from "@/features/_shared/embed";

type BaseMessageLayout = z.infer<typeof BaseMessageLayoutSchema>;

export const welcomeImageStyleSchema = z.object({
    backgroundColor: z.string().default("#000000"),
    accentColor: z.string().default("#5865F2"),
    avatarRingColor: z.string().default("#5865F2"),
    headingColor: z.string().default("#FFFFFF"),
    usernameColor: z.string().default("#FFFFFF"),
    memberTextColor: z.string().default("#B5BAC1"),
    accentDiagColor: z.string().default("#5865F2"),
    separatorColor: z.string().default("#FFFFFF"),
});

export const memberMessageConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().nullish().default(null),
    sendImage: z.boolean().default(false),
    imageStyle: welcomeImageStyleSchema.default(welcomeImageStyleSchema.parse({})),
    message: BaseMessageLayoutSchema.default({
        format: "EMBED",
        content: "",
        embed: {},
    }),
});

const DEFAULT_MESSAGE_CONFIG = {
    enabled: false,
    channelId: null,
    sendImage: false,
    imageStyle: welcomeImageStyleSchema.parse({}),
    message: {
        format: "EMBED" as const,
        content: "",
        embed: {},
    },
};

export const welcomeConfigSchema = z.object({
    public: memberMessageConfigSchema.default(DEFAULT_MESSAGE_CONFIG),
    private: memberMessageConfigSchema.default(DEFAULT_MESSAGE_CONFIG),
    joinRoleIds: z.array(z.string()).default([]),
});

export const saveWelcomeConfigSchema = welcomeConfigSchema.superRefine((data, ctx) => {
    if (data.public.enabled && isBlank(data.public.channelId)) {
        ctx.addIssue({
            code: 'custom',
            message: "Please select a channel for public welcome messages.",
            path: ["public", "channelId"],
        });
    }
    if (data.public.enabled) {
        checkMessageNotEmpty(data.public.message, ["public"], ctx);
    }
    if (data.private.enabled) {
        checkMessageNotEmpty(data.private.message, ["private"], ctx);
    }
});

export function isBlank(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim() === "";
}

export function checkMessageNotEmpty(
    message: BaseMessageLayout,
    pathPrefix: (string | number)[],
    ctx: z.RefinementCtx,
): void {
    if (message.format === "TEXT") {
        if (message.content.trim() === "") {
            ctx.addIssue({
                code: 'custom',
                message: "Message content cannot be empty when format is set to TEXT!",
                path: [...pathPrefix, "message", "content"],
            });
        }
    } else if (isEmbedEmpty(message.embed)) {
        ctx.addIssue({
            code: 'custom',
            message: "Embed must have a title, description, or fields when format is set to EMBED!",
            path: [...pathPrefix, "message", "embed"],
        });
    }
}

export type MemberMessageConfig = z.infer<typeof memberMessageConfigSchema>;
export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;
export type WelcomeImageStyle = z.infer<typeof welcomeImageStyleSchema>;