export type StrategyType = "EXACT" | "SUBSTRING" | "REGEX";
export type FlagThreshold = "MILD" | "MODERATE" | "SEVERE";
export type ScopeActionMode = "EXEMPT" | "ENFORCED";

export type RuleAction =
    | "DELETE"
    | "WARN"
    | "TIMEOUT"
    | "REMIND_PUBLICLY"
    | "REMIND_PRIVATELY";

export type ScopeListMode = "ALLOWLIST" | "DENYLIST";

export interface Scope {
    mode: ScopeActionMode;
    roles: string[];
    channels: string[];
}

export interface BaseRule {
    enabled: boolean;
    action: RuleAction[];
    timeout_duration_seconds?: number; // Required if "timeout" action is selected
    scope: Scope;
}

export interface Pattern {
    value: string;
    strategy: StrategyType;
}

export interface BadWordsRule extends BaseRule {
    patterns: Pattern[];
}

export interface ExcessiveCapsRule extends BaseRule {
    threshold: number; // 0.0 to 1.0 (ratio of caps)
    minLength: number; // Minimum message length to evaluate
}

export interface ExcessiveEmojisRule extends BaseRule {
    maxEmojis: number; // Absolute limit of emojis per message
}

export interface ExcessiveSpoilersRule extends BaseRule {
    threshold: number; // 0.0 to 1.0 (ratio of spoiler characters)
}

export interface ExcessiveMentionsRule extends BaseRule {
    maxMentions: number; // Absolute limit of mentions per message
}

export interface AntiSpamRule extends BaseRule {
    messagesPerWindow: number;
    windowSeconds: number;
}


export interface ExternalLinksRule extends BaseRule {
    blockOnlyMalicious: boolean;
    mode: ScopeListMode;
    allowedDomains?: string[];
    blockedDomains?: string[];
}

export interface OffensiveMessages extends BaseRule {
    flagThreshold: FlagThreshold;
}

export type ServerInvitesRule = BaseRule;
export type ZalgoRule = BaseRule;
export type CryptoAddress = BaseRule;

export interface MessageFilteringConfig {
    badWords: BadWordsRule;
    serverInvites: ServerInvitesRule;
    externalLinks: ExternalLinksRule;
    excessiveCaps: ExcessiveCapsRule;
    excessiveEmojis: ExcessiveEmojisRule;
    excessiveSpoilers: ExcessiveSpoilersRule;
    excessiveMentions: ExcessiveMentionsRule;
    zalgo: ZalgoRule;
    antiSpam: AntiSpamRule;
    offensiveMessages: OffensiveMessages;
    cryptoAddress: CryptoAddress;
    globalSettings: Scope;
}

export interface BadWordRuleset {
    id: string;
    guild_id: string;
    name: string;
    enabled: boolean;
    patterns: Pattern[];
    actions: RuleAction[];
    timeout_duration_seconds: number | null;
    scope: Scope;
    created_at: Date;
    updated_at: Date;
}