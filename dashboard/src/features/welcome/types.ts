import { z } from "zod";
import {
    BaseMessageLayoutSchema,
    DEFAULT_TOGGLABLE_MESSAGE_LAYOUT,
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

export const publicWelcomeConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channel_id: z.string().nullish().default(null),
    sendImage: z.boolean().default(false),
    imageStyle: welcomeImageStyleSchema.default(welcomeImageStyleSchema.parse({})),
    // Lax on purpose: emptiness is enforced at save time, and only when this
    // section is enabled (draft mode). See `saveWelcomeConfigSchema`.
    message: BaseMessageLayoutSchema.default({
        format: "EMBED",
        content: "",
        embed: {},
    }),
});

export const privateWelcomeConfigSchema = z
    .object({
        enabled: z.boolean().default(false),
        // Same draft-mode laxity as the public message.
        message: BaseMessageLayoutSchema,
    })
    .default(DEFAULT_TOGGLABLE_MESSAGE_LAYOUT);

export const welcomeConfigSchema = z.object({
    public: publicWelcomeConfigSchema.default({
        enabled: false,
        channel_id: null,
        sendImage: false,
        imageStyle: welcomeImageStyleSchema.parse({}),
        message: {
            format: "EMBED",
            content: "",
            embed: {},
        },
    }),
    private: privateWelcomeConfigSchema.default(DEFAULT_TOGGLABLE_MESSAGE_LAYOUT),
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

export type PublicWelcomeConfig = z.infer<typeof publicWelcomeConfigSchema>;
export type PrivateWelcomeConfig = z.infer<typeof privateWelcomeConfigSchema>;
export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;
export type WelcomeImageStyle = z.infer<typeof welcomeImageStyleSchema>;