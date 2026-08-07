import { z } from "zod";

export const FormatSchema = z.enum(["EMBED", "TEXT"]);

export const EmbedThumbnailSchema = z.object({
    url: z.string(),
});

export const EmbedAuthorSchema = z.object({
    name: z.string(),
    icon_url: z.string().optional(),
});

export const EmbedFooterSchema = z.object({
    text: z.string(),
    icon_url: z.string().optional(),
});

export const EmbedFieldSchema = z.object({
    name: z.string(),
    value: z.string(),
    inline: z.boolean().optional(),
});

export const DiscordEmbedSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    color: z.number().int().optional(),
    thumbnail: EmbedThumbnailSchema.optional(),
    author: EmbedAuthorSchema.optional(),
    footer: EmbedFooterSchema.optional(),
    fields: z.array(EmbedFieldSchema).optional(),
    image: EmbedThumbnailSchema.optional(),
});

export type Format = z.infer<typeof FormatSchema>;
export type EmbedThumbnail = z.infer<typeof EmbedThumbnailSchema>;
export type EmbedAuthor = z.infer<typeof EmbedAuthorSchema>;
export type EmbedFooter = z.infer<typeof EmbedFooterSchema>;
export type EmbedField = z.infer<typeof EmbedFieldSchema>;
export type DiscordEmbed = z.infer<typeof DiscordEmbedSchema>;

export const DEFAULT_MESSAGE_LAYOUT = Object.freeze({
    enabled: false,
    format: "TEXT" as const,
    content: "",
    embed: {},
});

export const isDeepEqual = (obj1: any, obj2: any): boolean => {
    if (obj1 === obj2) return true;

    const isEmpty = (val: any) => val === undefined || val === null || val === "";

    if (isEmpty(obj1) && isEmpty(obj2)) return true;

    if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 == null || obj2 == null) {
        return false;
    }

    const keys1 = Object.keys(obj1).filter((k) => !isEmpty(obj1[k]));
    const keys2 = Object.keys(obj2).filter((k) => !isEmpty(obj2[k]));

    const hasColor1 = keys1.includes("color");
    const hasColor2 = keys2.includes("color");

    if (hasColor1 !== hasColor2) {
        if (hasColor1 && obj1.color === 0) {
            keys1.splice(keys1.indexOf("color"), 1);
        } else if (hasColor2 && obj2.color === 0) {
            keys2.splice(keys2.indexOf("color"), 1);
        }
    }

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!isDeepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
};

export const isEmbedEmpty = (embed: Record<string, any> | undefined | null): boolean => {
    if (!embed) return true;
    const hasTitle = Boolean(embed.title?.trim());
    const hasDescription = Boolean(embed.description?.trim());
    const hasFields = Boolean(embed.fields && embed.fields.length > 0);
    const hasAuthor = Boolean(embed.author?.name?.trim());
    const hasFooter = Boolean(embed.footer?.text?.trim());
    const hasImage = Boolean(embed.image?.url?.trim());
    const hasThumbnail = Boolean(embed.thumbnail?.url?.trim());

    return !hasTitle && !hasDescription && !hasFields && !hasAuthor && !hasFooter && !hasImage && !hasThumbnail;
};

export const BaseMessageLayoutSchema = z.object({
    enabled: z.boolean().default(false),
    format: FormatSchema,
    content: z.string().default(""),
    embed: DiscordEmbedSchema.default({}),
});

export const MessageLayoutSchema = BaseMessageLayoutSchema.superRefine((data, ctx) => {
    if (!data.enabled) return;

    if (data.format === "TEXT") {
        if (!data.content || data.content.trim() === "") {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Message content cannot be empty when format is set to TEXT!",
                path: ["content"],
            });
        }
    } else if (data.format === "EMBED") {
        if (isEmbedEmpty(data.embed)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Embed must have a title, description, or fields when format is set to EMBED!",
                path: ["embed"],
            });
        }
    }
});