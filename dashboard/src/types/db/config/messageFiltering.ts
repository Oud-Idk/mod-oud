import { Scope } from "@/types/db/config/index";
import { FlagThreshold, RuleAction, ScopeListMode, StrategyType } from "@/types/db";

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
    globalSettings: Scope;
}