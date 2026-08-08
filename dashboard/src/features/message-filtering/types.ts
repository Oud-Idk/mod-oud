import { z } from "zod";

export const strategyTypeSchema = z.enum(["EXACT", "SUBSTRING", "REGEX"]).default("EXACT");
export const flagThresholdSchema = z.enum(["MILD", "MODERATE", "SEVERE"]).default("MODERATE");
export const scopeActionModeSchema = z.enum(["EXEMPT", "ENFORCED"]).default("EXEMPT");
export const ruleActionSchema = z.enum([
    "DELETE",
    "WARN",
    "TIMEOUT",
    "REMIND_PUBLICLY",
    "REMIND_PRIVATELY",
]);
export const scopeListModeSchema = z.enum(["ALLOWLIST", "DENYLIST"]).default("ALLOWLIST");

export const scopeSchema = z.object({
    mode: scopeActionModeSchema,
    roles: z.array(z.string()).default([]),
    channels: z.array(z.string()).default([]),
});

export const baseRuleSchema = z.object({
    enabled: z.boolean().default(false),
    action: z.array(ruleActionSchema).default([]),
    timeoutDurationSeconds: z.number().nullish().default(null),
    scope: scopeSchema.default(scopeSchema.parse({})),
});

export const patternSchema = z.object({
    value: z.string().min(1, "Pattern cannot be empty"),
    strategy: strategyTypeSchema,
});

export const badWordsRuleSchema = baseRuleSchema.extend({
    patterns: z.array(patternSchema).default([]),
});

export const excessiveCapsRuleSchema = baseRuleSchema.extend({
    threshold: z.number().default(0.7),
    minLength: z.number().default(10),
});

export const excessiveEmojisRuleSchema = baseRuleSchema.extend({
    maxEmojis: z.number().default(10),
});

export const excessiveSpoilersRuleSchema = baseRuleSchema.extend({
    threshold: z.number().default(0.5),
});

export const excessiveMentionsRuleSchema = baseRuleSchema.extend({
    maxMentions: z.number().default(5),
});

export const antiSpamRuleSchema = baseRuleSchema.extend({
    messagesPerWindow: z.number().default(8),
    windowSeconds: z.number().default(5),
});

export const externalLinksRuleSchema = baseRuleSchema.extend({
    blockOnlyMalicious: z.boolean().default(true),
    mode: scopeListModeSchema,
    allowedDomains: z.array(z.string()).default([]),
    blockedDomains: z.array(z.string()).default([]),
});

export const offensiveMessagesSchema = baseRuleSchema.extend({
    flagThreshold: flagThresholdSchema,
});

export const serverInvitesRuleSchema = baseRuleSchema;
export const zalgoRuleSchema = baseRuleSchema;
export const cryptoAddressRuleSchema = baseRuleSchema;

export const messageFilteringConfigSchema = z.object({
    badWords: badWordsRuleSchema.default(badWordsRuleSchema.parse({})),
    serverInvites: serverInvitesRuleSchema.default(serverInvitesRuleSchema.parse({})),
    externalLinks: externalLinksRuleSchema.default(externalLinksRuleSchema.parse({})),
    excessiveCaps: excessiveCapsRuleSchema.default(excessiveCapsRuleSchema.parse({})),
    excessiveEmojis: excessiveEmojisRuleSchema.default(excessiveEmojisRuleSchema.parse({})),
    excessiveSpoilers: excessiveSpoilersRuleSchema.default(excessiveSpoilersRuleSchema.parse({})),
    excessiveMentions: excessiveMentionsRuleSchema.default(excessiveMentionsRuleSchema.parse({})),
    zalgo: zalgoRuleSchema.default(zalgoRuleSchema.parse({})),
    antiSpam: antiSpamRuleSchema.default(antiSpamRuleSchema.parse({})),
    offensiveMessages: offensiveMessagesSchema.default(offensiveMessagesSchema.parse({})),
    cryptoAddress: cryptoAddressRuleSchema.default(cryptoAddressRuleSchema.parse({})),
    globalSettings: scopeSchema.default(scopeSchema.parse({})),
});

export const badWordRulesetSchema = z.object({
    id: z.string(),
    guildId: z.string().optional(),
    name: z.string(),
    enabled: z.boolean().default(true),
    patterns: z.array(patternSchema).default([]),
    actions: z.array(ruleActionSchema).default([]),
    timeoutDurationSeconds: z.number().nullish().default(null),
    scope: scopeSchema.default(scopeSchema.parse({})),
    createdAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
});

export const saveBadWordRulesetInputSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Ruleset name is required"),
    enabled: z.boolean().default(true),
    patterns: z.array(patternSchema).default([]),
    actions: z.array(ruleActionSchema).default([]),
    timeoutDurationSeconds: z.number().nullish().default(null),
    scope: scopeSchema.default(scopeSchema.parse({})),
});

export type StrategyType = z.infer<typeof strategyTypeSchema>;
export type FlagThreshold = z.infer<typeof flagThresholdSchema>;
export type ScopeActionMode = z.infer<typeof scopeActionModeSchema>;
export type RuleAction = z.infer<typeof ruleActionSchema>;
export type ScopeListMode = z.infer<typeof scopeListModeSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type BaseRule = z.infer<typeof baseRuleSchema>;
export type Pattern = z.infer<typeof patternSchema>;
export type BadWordsRule = z.infer<typeof badWordsRuleSchema>;
export type ExcessiveCapsRule = z.infer<typeof excessiveCapsRuleSchema>;
export type ExcessiveEmojisRule = z.infer<typeof excessiveEmojisRuleSchema>;
export type ExcessiveSpoilersRule = z.infer<typeof excessiveSpoilersRuleSchema>;
export type ExcessiveMentionsRule = z.infer<typeof excessiveMentionsRuleSchema>;
export type AntiSpamRule = z.infer<typeof antiSpamRuleSchema>;
export type ExternalLinksRule = z.infer<typeof externalLinksRuleSchema>;
export type OffensiveMessages = z.infer<typeof offensiveMessagesSchema>;
export type ServerInvitesRule = z.infer<typeof serverInvitesRuleSchema>;
export type ZalgoRule = z.infer<typeof zalgoRuleSchema>;
export type CryptoAddress = z.infer<typeof cryptoAddressRuleSchema>;
export type MessageFilteringConfig = z.infer<typeof messageFilteringConfigSchema>;
export type BadWordRuleset = z.infer<typeof badWordRulesetSchema>;
export type SaveableBadWordRuleset = z.infer<typeof saveBadWordRulesetInputSchema>;

export const defaultMessageFilteringConfig: MessageFilteringConfig = messageFilteringConfigSchema.parse({});