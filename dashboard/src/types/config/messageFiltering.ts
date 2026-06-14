import { Scope } from "@/types/config/index";

export type RuleAction =
    | "delete"
    | "warn"
    | "timeout"
    | "remind_publicly"
    | "remind_privately";

export interface BaseRule {
    enabled: boolean;
    action: RuleAction[];
    timeout_duration_seconds?: number; // Required if "timeout" action is selected
    scope: Scope;
}

export interface Pattern {
    value: string;
    strategy: "exact" | "substring" | "regex";
}

export interface BadWordsRule extends BaseRule {
    patterns: Pattern[];
}

export interface ExcessiveCapsRule extends BaseRule {
    threshold: number; // 0.0 to 1.0 (ratio of caps)
    min_length: number; // Minimum message length to evaluate
}

export interface ExcessiveEmojisRule extends BaseRule {
    max_emojis: number; // Absolute limit of emojis per message
}

export interface ExcessiveSpoilersRule extends BaseRule {
    threshold: number; // 0.0 to 1.0 (ratio of spoiler characters)
}

export interface ExcessiveMentionsRule extends BaseRule {
    max_mentions: number; // Absolute limit of mentions per message
}

export interface AntiSpamRule extends BaseRule {
    messages_per_window: number;
    window_seconds: number;
}

export interface ExternalLinksRule extends BaseRule {
    block_only_malicious: boolean;
    mode: "allowlist" | "denylist";
    allowed_domains?: string[];
    blocked_domains?: string[];
}

export interface OffensiveMessages extends BaseRule {
    flag_threshold: "MILD" | "MODERATE" | "SEVERE";
}


export type ServerInvitesRule = BaseRule;
export type ZalgoRule = BaseRule;

export interface MessageFilteringConfig {
    bad_words: BadWordsRule;
    server_invites: ServerInvitesRule;
    external_links: ExternalLinksRule;
    excessive_caps: ExcessiveCapsRule;
    excessive_emojis: ExcessiveEmojisRule;
    excessive_spoilers: ExcessiveSpoilersRule;
    excessive_mentions: ExcessiveMentionsRule;
    zalgo: ZalgoRule;
    anti_spam: AntiSpamRule;
    offensive_messages: OffensiveMessages;
    global_settings: Scope;
}