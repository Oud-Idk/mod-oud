import { z } from "zod";
import {
    BaseMessageLayoutSchema,
    isEmbedEmpty,
} from "@/features/_shared/embed";

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

export const WelcomeMessageConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channel_id: z.string().nullish().default(null),
    sendImage: z.boolean().default(false),
    imageStyle: welcomeImageStyleSchema.default(welcomeImageStyleSchema.parse({})),
    message: BaseMessageLayoutSchema.default({
        format: "EMBED",
        content: "",
        embed: {},
    }),
});

const DEFAULT_WELCOME_MESSAGE_CONFIG = {
    enabled: false,
    channel_id: null,
    sendImage: false,
    imageStyle: welcomeImageStyleSchema.parse({}),
    message: {
        format: "EMBED" as const,
        content: "",
        embed: {},
    },
}

export const welcomeConfigSchema = z.object({
    public: WelcomeMessageConfigSchema.default(DEFAULT_WELCOME_MESSAGE_CONFIG),
    private: WelcomeMessageConfigSchema.default(DEFAULT_WELCOME_MESSAGE_CONFIG),
    joinRoleIds: z.array(z.string()).default([]),
});

export const saveWelcomeConfigSchema = welcomeConfigSchema.superRefine((data, ctx) => {
    if (data.public.enabled && (data.public.channel_id === null || data.public.channel_id.trim() === "")) {
        ctx.addIssue({
            code: 'custom',
            message: "Please select a channel for public welcome messages.",
            path: ["public", "channel_id"],
        });
    }
    if (data.public.enabled) {
        checkMessageNotEmpty(data.public.message, "public", ctx);
    }
    if (data.private.enabled) {
        checkMessageNotEmpty(data.private.message, "private", ctx);
    }
});

// Same rules (and messages/paths) as the shared `messageLayoutSchema`, but
// only applied when the section is actually enabled — a disabled section with
// an empty draft must never block saving the rest of the form.
function checkMessageNotEmpty(
    message: BaseMessageLayout,
    section: "public" | "private",
    ctx: z.RefinementCtx,
): void {
    if (message.format === "TEXT") {
        if (message.content.trim() === "") {
            ctx.addIssue({
                code: 'custom',
                message: "Message content cannot be empty when format is set to TEXT!",
                path: [section, "message", "content"],
            });
        }
    } else if (isEmbedEmpty(message.embed)) {
        ctx.addIssue({
            code: 'custom',
            message: "Embed must have a title, description, or fields when format is set to EMBED!",
            path: [section, "message", "embed"],
        });
    }
}

export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;
export type WelcomeImageStyle = z.infer<typeof welcomeImageStyleSchema>;