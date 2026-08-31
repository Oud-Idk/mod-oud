import { z } from "zod";
import { messageLayoutSchema } from "@/features/_shared/embed";

export const DEFAULT_ITEM_MESSAGE = {
    enabled: true,
    format: "TEXT" as const,
    content: "",
    embed: {},
};

export const economyConfigSchema = z
    .object({
        enabled: z.boolean().default(false),
        currencyName: z.string().default("coins"),
        workCooldownSecs: z.number().int().nonnegative().default(3600),
        workMinReward: z.number().int().nonnegative().default(1000),
        workMaxReward: z.number().int().nonnegative().default(5000),
    })
    .refine((data) => data.workMinReward <= data.workMaxReward, {
        message: "Minimum work reward must be less than or equal to maximum work reward.",
        path: ["workMaxReward"],
    });

export const matchTypeSchema = z.enum(["EVERY", "AT_LEAST_ONE", "NONE"]);
export const triggerFlagsSchema = z.number().int().default(1);

export const itemRequirementSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("ROLE"),
        matchType: matchTypeSchema.default("EVERY"),
        triggerFlags: triggerFlagsSchema,
        roleIds: z.array(z.string()).default([]),
    }),
    z.object({
        type: z.literal("TOTAL_BALANCE"),
        triggerFlags: triggerFlagsSchema,
        balance: z.number().int().default(0),
    }),
    z.object({
        type: z.literal("ITEM"),
        matchType: matchTypeSchema.default("EVERY"),
        triggerFlags: triggerFlagsSchema,
        quantities: z.record(z.string(), z.number().int()).default({}),
    }),
]);

export const itemActionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("RESPOND"),
        triggerFlags: triggerFlagsSchema,
        message: messageLayoutSchema.default(DEFAULT_ITEM_MESSAGE),
    }),
    z.object({
        type: z.literal("ADD_ROLES"),
        triggerFlags: triggerFlagsSchema,
        roleIds: z.array(z.string()).default([]),
    }),
    z.object({
        type: z.literal("REMOVE_ROLES"),
        triggerFlags: triggerFlagsSchema,
        roleIds: z.array(z.string()).default([]),
    }),
    z.object({
        type: z.literal("ADD_BALANCE"),
        triggerFlags: triggerFlagsSchema,
        balance: z.number().int().default(0),
    }),
    z.object({
        type: z.literal("REMOVE_BALANCE"),
        triggerFlags: triggerFlagsSchema,
        balance: z.number().int().default(0),
    }),
    z.object({
        type: z.literal("ADD_ITEMS"),
        triggerFlags: triggerFlagsSchema,
        quantities: z.record(z.string(), z.number().int()).default({}),
        itemIds: z.array(z.string()).default([]),
    }),
    z.object({
        type: z.literal("REMOVE_ITEMS"),
        triggerFlags: triggerFlagsSchema,
        quantities: z.record(z.string(), z.number().int()).default({}),
        itemIds: z.array(z.string()).default([]),
    }),
]);

export const economyItemSchema = z.object({
    id: z.uuid().optional(),
    name: z.string().min(1, "Name is required").max(100),
    price: z.number().int().nonnegative().default(0),
    description: z.string().default(""),
    emoji: z.string().optional(),
    category: z.string().nullable().default(null),

    unlimitedStock: z.boolean().default(true),
    stockRemaining: z.number().int().nonnegative().default(0),
    isListed: z.boolean().default(true),
    isInventory: z.boolean().default(true),
    isUsable: z.boolean().default(false),
    isSellable: z.boolean().default(false),

    requirements: z.array(itemRequirementSchema).default([]),
    actions: z.array(itemActionSchema).default([]),
});

export type EconomyConfig = z.infer<typeof economyConfigSchema>;
export type EconomyConfigInput = z.input<typeof economyConfigSchema>;
export type MatchType = z.infer<typeof matchTypeSchema>;
export type ItemRequirement = z.infer<typeof itemRequirementSchema>;
export type ItemAction = z.infer<typeof itemActionSchema>;
export type EconomyItem = z.infer<typeof economyItemSchema>;
