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

const isObject = (val: unknown): val is Record<string, unknown> => {
    return typeof val === "object" && val !== null;
};

export const isDeepEqual = (obj1: unknown, obj2: unknown): boolean => {
    if (obj1 === obj2) return true;

    const isEmpty = (val: unknown): boolean => val === undefined || val === null || val === "";

    if (isEmpty(obj1) && isEmpty(obj2)) return true;

    if (!isObject(obj1) || !isObject(obj2)) {
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

export const isEmbedEmpty = (embed: DiscordEmbed): boolean => {
    const hasTitle = Boolean(embed.title?.trim());
    const hasDescription = Boolean(embed.description?.trim());
    const hasFields = Boolean(embed.fields && embed.fields.length > 0);
    const hasAuthor = Boolean(embed.author?.name.trim());
    const hasFooter = Boolean(embed.footer?.text.trim());
    const hasImage = Boolean(embed.image?.url.trim());
    const hasThumbnail = Boolean(embed.thumbnail?.url.trim());

    return !hasTitle && !hasDescription && !hasFields && !hasAuthor && !hasFooter && !hasImage && !hasThumbnail;
};

export const BaseMessageLayoutSchema = z.object({
    format: FormatSchema,
    content: z.string().default(""),
    embed: DiscordEmbedSchema.default({}),
});

export const messageLayoutSchema = BaseMessageLayoutSchema.superRefine((data, ctx) => {
    if (data.format === "TEXT") {
        if (data.content.trim() === "") {
            ctx.addIssue({
                code: 'custom',
                message: "Message content cannot be empty when format is set to TEXT!",
                path: ["content"],
            });
        }
    } else {
        if (isEmbedEmpty(data.embed)) {
            ctx.addIssue({
                code: 'custom',
                message: "Embed must have a title, description, or fields when format is set to EMBED!",
                path: ["embed"],
            });
        }
    }
});

export const DEFAULT_TOGGLABLE_MESSAGE_LAYOUT = Object.freeze({
    enabled: false,
    message: DEFAULT_MESSAGE_LAYOUT,
});

export const TogglableMessageSchema = z.object({
    enabled: z.boolean().default(false),
    message: messageLayoutSchema,
}).default(DEFAULT_TOGGLABLE_MESSAGE_LAYOUT);

export type MessageLayout = z.infer<typeof messageLayoutSchema>;

export const IsoDateSchema = z
    .union([z.string(), z.date()])
    .transform((val) => (val instanceof Date ? val.toISOString() : val));