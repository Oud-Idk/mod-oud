import { MessageFilteringConfig, Pattern, RuleAction } from "@/types/config/messageFiltering";
import { db } from "@/utils/init/db";
import redis from "@/utils/init/redis";
import {
    LeaveConfig,
    LevelingConfig,
    MessageLayout,
    MessageLoggingConfig,
    ReportConfig,
    Scope,
    TicketConfig
} from "@/types/config";
import { WelcomeConfig } from "@/types/config/welcome";
import { ModerationDMsConfig } from "@/types/config/moderationDMs";

export interface BadWordRulesetRow {
    id: string;
    guildId: string;
    name: string;
    enabled: boolean;
    patterns: Pattern[];
    actions: RuleAction[];
    timeoutDurationSeconds: number | null;
    scope: Scope;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Generic JSONB settings getter
 */
export async function getGuildConfigField<T>(guildId: string, key: string): Promise<T | null> {
    const query = `
        SELECT settings -> $2 AS config
        FROM guild_configs
        WHERE guild_id = $1
    `;
    const res = await db.query(query, [guildId, key]);
    return res.rows[0]?.config || null;
}

/**
 * Generic JSONB settings upsert
 */
export async function saveGuildConfigField<T>(guildId: string, key: string, value: T): Promise<void> {
    const query = `
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, JSONB_BUILD_OBJECT($2::TEXT, $3::JSONB))
        ON CONFLICT (guild_id) DO UPDATE
            SET settings = JSONB_SET(
                    COALESCE(guild_configs.settings, '{}'::JSONB),
                    ARRAY [$2::TEXT],
                    $3::JSONB
                           );
    `;
    await db.query(query, [guildId, key, JSON.stringify(value)]);

    const cacheKey = `config:guild:${guildId}`;
    try {
        await redis.del(cacheKey);

        await redis.publish("config_updates", `invalidate:${guildId}`);
    } catch (redisError) {
        console.error(`Failed to clear cache for guild ${guildId}:`, redisError);
    }
}


export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig> {
    const default_config: WelcomeConfig = {
        public: { enabled: false, channel_id: "", format: "embed", content: "", embed: "" },
        private: { enabled: false, format: "embed", content: "", embed: "" },
        join_role_ids: []
    };

    const dbWelcome = await getGuildConfigField<any>(guildId, 'welcome');
    if (!dbWelcome) return default_config;

    // Legacy fallback mapping
    if ("send_public_message" in dbWelcome || "channel_id" in dbWelcome) {
        return {
            public: {
                enabled: !!dbWelcome.send_public_message,
                channel_id: dbWelcome.channel_id || "",
                format: dbWelcome.format || "embed",
                content: dbWelcome.content || "",
                embed: dbWelcome.embed || "",
            },
            private: { enabled: false, format: "embed", content: "", embed: "" },
            join_role_ids: dbWelcome.join_role_ids || []
        };
    }

    return {
        public: { ...default_config.public, ...(dbWelcome.public || {}) },
        private: { ...default_config.private, ...(dbWelcome.private || {}) },
        join_role_ids: dbWelcome.join_role_ids || []
    };
}

export async function saveWelcomeConfig(guildId: string, config: WelcomeConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'welcome', config);
}

export async function getLeaveConfig(guildId: string): Promise<LeaveConfig> {
    const default_config: LeaveConfig = {
        enabled: false,
        channel_id: "",
        format: "embed",
        content: "",
        embed: "",
    };

    const dbLeave = await getGuildConfigField<any>(guildId, 'leave');
    if (!dbLeave) return default_config;

    return { ...default_config, ...dbLeave };
}

export async function saveLeaveConfig(guildId: string, config: LeaveConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'leave', config);
}

export async function getReportConfig(guildId: string): Promise<ReportConfig> {
    const default_message_config: MessageLayout = {
        enabled: false,
        format: "text",
        content: "",
        embed: "",
    }

    const default_config: ReportConfig = {
        enabled: false,
        resolved_dm: default_message_config,
        dismissed_dm: default_message_config,
    };

    const dbReport = await getGuildConfigField<any>(guildId, 'report');
    if (!dbReport) return default_config;

    return { ...default_config, ...dbReport };
}

export async function saveReportConfig(guildId: string, config: ReportConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'report', config);
}

export async function getMessageLoggingConfig(guildId: string): Promise<MessageLoggingConfig> {
    const default_config: MessageLoggingConfig = {
        enabled: false,
        ignored_channels: [],
        ignored_roles: [],
        ignored_users: [],
        events: { message_delete: false, message_edit: false }
    };

    const dbMessageLogging = await getGuildConfigField<any>(guildId, 'message_logging');
    if (!dbMessageLogging) return default_config;

    return {
        ...default_config,
        ...dbMessageLogging,
        ignored_channels: dbMessageLogging.ignored_channels || [],
        ignored_roles: dbMessageLogging.ignored_roles || [],
        ignored_users: dbMessageLogging.ignored_users || [],
    };
}

export async function saveMessageLoggingConfig(guildId: string, config: MessageLoggingConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'message_logging', config);
}

export async function getMessageFilteringConfig(guildId: string): Promise<MessageFilteringConfig> {
    const default_scope = {
        mode: "exempt" as const,
        roles: [],
        channels: [],
    };

    const default_base = {
        enabled: false,
        action: [],
        scope: default_scope
    };

    const default_config: MessageFilteringConfig = {
        bad_words: { ...default_base, patterns: [] },
        server_invites: default_base,
        external_links: {
            ...default_base,
            block_only_malicious: true,
            allowed_domains: [],
            blocked_domains: [],
            mode: "allowlist"
        },
        excessive_caps: { ...default_base, threshold: 0.7, min_length: 10 },
        excessive_emojis: { ...default_base, max_emojis: 10 },
        excessive_spoilers: { ...default_base, threshold: 0.5 },
        excessive_mentions: { ...default_base, max_mentions: 5 },
        zalgo: default_base,
        anti_spam: { ...default_base, messages_per_window: 8, window_seconds: 5 },
        offensive_messages: { ...default_base, flag_threshold: "MODERATE" },
        global_settings: { ...default_scope }
    };

    const dbConfig = await getGuildConfigField<any>(guildId, 'message_filtering');
    if (!dbConfig) return default_config;

    // Merge default configuration with whatever exists in the database
    return {
        bad_words: { ...default_config.bad_words, ...(dbConfig.bad_words || {}) },
        server_invites: { ...default_config.server_invites, ...(dbConfig.server_invites || {}) },
        external_links: { ...default_config.external_links, ...(dbConfig.external_links || {}) },
        excessive_caps: { ...default_config.excessive_caps, ...(dbConfig.excessive_caps || {}) },
        excessive_emojis: { ...default_config.excessive_emojis, ...(dbConfig.excessive_emojis || {}) },
        excessive_spoilers: { ...default_config.excessive_spoilers, ...(dbConfig.excessive_spoilers || {}) },
        excessive_mentions: { ...default_config.excessive_mentions, ...(dbConfig.excessive_mentions || {}) },
        zalgo: { ...default_config.zalgo, ...(dbConfig.zalgo || {}) },
        anti_spam: { ...default_config.anti_spam, ...(dbConfig.anti_spam || {}) },
        offensive_messages: { ...default_config.offensive_messages, ...(dbConfig.offensive_messages || {}) },
        global_settings: { ...default_scope, ...(dbConfig.global_settings || {}) },
    };
}

export async function saveMessageFilteringConfig(guildId: string, config: MessageFilteringConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'message_filtering', config);
}

export async function getLevelingConfig(guildId: string): Promise<LevelingConfig> {
    const defaultConfig: LevelingConfig = {
        text: {
            enabled: false,
            xp_cooldown: 60,
            xp_range: { min: 15, max: 25 },
            xp_on_tickets: false,
        },
        voice: {
            xp_range: { min: 25, max: 50 },
            enabled: false,
        },
        scope: {
            mode: "exempt",
            roles: [],
            channels: [],
        },
        level_cap: 40,
        keep_level_on_leave: false,
        notify: {
            channel_id: "",
            scope: "none",
            format: "text",
            content: "",
            embed: "",
        }
    }

    const dbLeveling = await getGuildConfigField<any>(guildId, 'leveling');
    if (!dbLeveling) return defaultConfig;

    return {
        ...defaultConfig,
        ...dbLeveling,
    }
}

export async function saveLevelingConfig(guildId: string, config: LevelingConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'leveling', config);
}

export async function getModerationDMsConfig(guildId: string): Promise<ModerationDMsConfig> {
    const default_template = {
        enabled: false,
        content: "",
        embed: {},
        format: "text" as const,
    };

    const default_config: ModerationDMsConfig = {
        warn: { ...default_template },
        pardon_warn: { ...default_template },
        unpardon_warn: { ...default_template },
        unpardon_delete_warn: { ...default_template },
        mute: { ...default_template },
        unmute: { ...default_template },
        kick: { ...default_template },
        ban: { ...default_template },
        softban: { ...default_template },
    };

    const dbConfig = await getGuildConfigField<any>(guildId, 'moderation_dms');
    if (!dbConfig) return default_config;

    return {
        warn: { ...default_template, ...(dbConfig.warn || {}) },
        pardon_warn: { ...default_template, ...(dbConfig.pardon_warn || {}) },
        unpardon_warn: { ...default_template, ...(dbConfig.unpardon_warn || {}) },
        unpardon_delete_warn: { ...default_template, ...(dbConfig.unpardon_delete_warn || {}) },
        mute: { ...default_template, ...(dbConfig.mute || {}) },
        unmute: { ...default_template, ...(dbConfig.unmute || {}) },
        kick: { ...default_template, ...(dbConfig.kick || {}) },
        ban: { ...default_template, ...(dbConfig.ban || {}) },
        softban: { ...default_template, ...(dbConfig.softban || {}) },
    };
}

export async function getTicketConfig(guildId: string): Promise<TicketConfig> {
    const defaultConfig = {
        category_id: "",
        enabled: false,
        channel_id: "",
        format: "text",
        content: "",
        embed: "",
        posted_message_id: "",
        ticket_role_id: "",
        warn_threshold: 30,
        delete_threshold: 45,
        bump_every: 20,
    }

    const defaultMessageConfig: MessageLayout = {
        enabled: false,
        format: "text",
        content: "",
        embed: "",
    }

    const dbConfig = await getGuildConfigField<any>(guildId, 'tickets');

    // Ensure dbConfig is an object to prevent errors when destructuring
    const safeDbConfig = dbConfig ?? {};

    return {
        ...defaultConfig,
        ...safeDbConfig,
        welcome_message: {
            ...defaultMessageConfig,
            ...(safeDbConfig.welcome_message ?? {}),
        }
    }
}

export async function saveTicketConfig(guildId: string, config: TicketConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'tickets', config);
}

export async function saveModerationDMsConfig(guildId: string, config: ModerationDMsConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'moderation_dms', config);
}

/**
 * Fetch all bad word rulesets for a specific guild
 */
export async function getBadWordRulesets(guildId: string): Promise<BadWordRulesetRow[]> {
    const query = `
        SELECT id,
               guild_id                 AS "guildId",
               name,
               enabled,
               patterns,
               actions,
               timeout_duration_seconds AS "timeoutDurationSeconds",
               scope,
               created_at               AS "createdAt",
               updated_at               AS "updatedAt"
        FROM bad_word_rulesets
        WHERE guild_id = $1
        ORDER BY created_at ASC
    `;
    const res = await db.query(query, [guildId]);
    return res.rows;
}

/**
 * Upsert a bad word ruleset (Insert or Update)
 */
export async function saveBadWordRuleset(
    guildId: string,
    ruleset: Omit<BadWordRulesetRow, 'createdAt' | 'updatedAt' | 'guildId'> & { id?: string }
): Promise<BadWordRulesetRow> {
    const query = `
        INSERT INTO bad_word_rulesets (id, guild_id, name, enabled, patterns, actions, timeout_duration_seconds, scope)
        VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5::JSONB, $6::JSONB, $7, $8::JSONB)
        ON CONFLICT (id) DO UPDATE SET name                     = EXCLUDED.name,
                                       enabled                  = EXCLUDED.enabled,
                                       patterns                 = EXCLUDED.patterns,
                                       actions                  = EXCLUDED.actions,
                                       timeout_duration_seconds = EXCLUDED.timeout_duration_seconds,
                                       scope                    = EXCLUDED.scope,
                                       updated_at               = CURRENT_TIMESTAMP
        RETURNING
            id,
            guild_id AS "guildId",
            name,
            enabled,
            patterns,
            actions,
            timeout_duration_seconds AS "timeoutDurationSeconds",
            scope,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
    `;

    const params = [
        ruleset.id || null,
        guildId,
        ruleset.name,
        ruleset.enabled,
        JSON.stringify(ruleset.patterns),
        JSON.stringify(ruleset.actions),
        ruleset.timeoutDurationSeconds,
        JSON.stringify(ruleset.scope)
    ];

    const res = await db.query(query, params);

    // Keep Redis cache in sync
    const cacheKey = `config:guild:${guildId}:bad_words`;
    try {
        await redis.del(cacheKey);
        await redis.publish("config_updates", `invalidate:${guildId}`);
    } catch (redisError) {
        console.error(`Failed to clear cache for guild ${guildId}:`, redisError);
    }

    return res.rows[0];
}

/**
 * Delete a bad word ruleset by ID and Guild ID
 */
export async function deleteBadWordRuleset(guildId: string, id: string): Promise<void> {
    const query = `
        DELETE
        FROM bad_word_rulesets
        WHERE id = $1
          AND guild_id = $2
    `;
    await db.query(query, [id, guildId]);

    const cacheKey = `config:guild:${guildId}`;
    try {
        await redis.del(cacheKey);
        await redis.publish("config_updates", `invalidate:${guildId}`);
    } catch (redisError) {
        console.error(`Failed to clear cache for guild ${guildId}:`, redisError);
    }
}