import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
import { db } from "@/utils/init/db";
import redis from "@/utils/init/redis";
import {
    HoneypotConfig,
    LeaveConfig,
    LevelingConfig,
    MemberCounterConfig,
    MessageLayout,
    MessageLoggingConfig, RaidDetectionConfig,
    ReportConfig,
    TempVoiceConfig,
    TicketConfig
} from "@/types/db/config";
import { WelcomeConfig } from "@/types/db/config/welcome";
import { ModerationDMsConfig } from "@/types/db/config/moderationDMs";
import { BadWordRuleset, Format, ScopeActionMode } from "@/types/db";

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
        public: { enabled: false, channel_id: "", format: "EMBED", content: "", embed: {} },
        private: { enabled: false, format: "EMBED", content: "", embed: {} },
        verification: {
            enabled: false,
            verificationMessageId: "",
            verificationChannelId: "",
            verificationRoleId: "",
            content: "Please complete the verification below to gain access to the server.",
            embed: {
                title: "Server Verification Required",
                description: "Click the verification button below to verify your account and gain full access.",
                color: 0x55EE77
            },
            useOauth: false,
            captchaType: 'TURNSTILE',
            format: "EMBED"
        },
        joinRoleIds: []
    };

    const dbWelcome = await getGuildConfigField<any>(guildId, 'welcome');
    if (!dbWelcome) return default_config;

    return {
        public: { ...default_config.public, ...(dbWelcome.public || {}) },
        private: { ...default_config.private, ...(dbWelcome.private || {}) },
        verification: { ...default_config.verification, ...(dbWelcome.verification || {}) },
        joinRoleIds: dbWelcome.join_role_ids || []
    };
}

export async function saveWelcomeConfig(guildId: string, config: WelcomeConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'welcome', config);
}

export async function getLeaveConfig(guildId: string): Promise<LeaveConfig> {
    const default_config: LeaveConfig = {
        enabled: false,
        channelId: "",
        format: "EMBED",
        content: "",
        embed: {},
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
        format: "TEXT",
        content: "",
        embed: {},
    }

    const default_config: ReportConfig = {
        enabled: false,
        resolvedDm: default_message_config,
        dismissedDm: default_message_config,
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
        ignored_channels: [],
        ignoredRoles: [],
        ignoredUsers: [],
        events: { messageDelete: false, messageEdit: false }
    };

    const dbMessageLogging = await getGuildConfigField<any>(guildId, 'message_logging');
    if (!dbMessageLogging) return default_config;

    return {
        ...default_config,
        ...dbMessageLogging,
        ignored_channels: dbMessageLogging.ignored_channels || [],
        ignoredRoles: dbMessageLogging.ignored_roles || [],
        ignoredUsers: dbMessageLogging.ignored_users || [],
    };
}

export async function saveMessageLoggingConfig(guildId: string, config: MessageLoggingConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'message_logging', config);
}

export async function getMessageFilteringConfig(guildId: string): Promise<MessageFilteringConfig> {
    const default_scope = {
        mode: "EXEMPT" as ScopeActionMode,
        roles: [],
        channels: [],
    };

    const default_base = {
        enabled: false,
        action: [],
        scope: default_scope
    };

    const default_config: MessageFilteringConfig = {
        badWords: { ...default_base, patterns: [] },
        serverInvites: default_base,
        externalLinks: {
            ...default_base,
            blockOnlyMalicious: true,
            allowedDomains: [],
            blockedDomains: [],
            mode: "ALLOWLIST"
        },
        excessiveCaps: { ...default_base, threshold: 0.7, minLength: 10 },
        excessiveEmojis: { ...default_base, maxEmojis: 10 },
        excessiveSpoilers: { ...default_base, threshold: 0.5 },
        excessiveMentions: { ...default_base, maxMentions: 5 },
        zalgo: default_base,
        cryptoAddress: default_base,
        antiSpam: { ...default_base, messagesPerWindow: 8, windowSeconds: 5 },
        offensiveMessages: { ...default_base, flagThreshold: "MODERATE" },
        globalSettings: { ...default_scope }
    };

    const dbConfig = await getGuildConfigField<any>(guildId, 'message_filtering');
    if (!dbConfig) return default_config;

    // Merge default configuration with whatever exists in the database
    return {
        badWords: { ...default_config.badWords, ...(dbConfig.bad_words || {}) },
        serverInvites: { ...default_config.serverInvites, ...(dbConfig.server_invites || {}) },
        externalLinks: { ...default_config.externalLinks, ...(dbConfig.external_links || {}) },
        excessiveCaps: { ...default_config.excessiveCaps, ...(dbConfig.excessive_caps || {}) },
        excessiveEmojis: { ...default_config.excessiveEmojis, ...(dbConfig.excessive_emojis || {}) },
        excessiveSpoilers: { ...default_config.excessiveSpoilers, ...(dbConfig.excessive_spoilers || {}) },
        excessiveMentions: { ...default_config.excessiveMentions, ...(dbConfig.excessive_mentions || {}) },
        zalgo: { ...default_config.zalgo, ...(dbConfig.zalgo || {}) },
        cryptoAddress: { ...default_config.cryptoAddress, ...(dbConfig.cryptoAddress || {}) },
        antiSpam: { ...default_config.antiSpam, ...(dbConfig.anti_spam || {}) },
        offensiveMessages: { ...default_config.offensiveMessages, ...(dbConfig.offensive_messages || {}) },
        globalSettings: { ...default_scope, ...(dbConfig.global_settings || {}) },
    };
}

export async function saveMessageFilteringConfig(guildId: string, config: MessageFilteringConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'message_filtering', config);
}

export async function saveTempVoiceChannelConfig(guildId: string, config: TempVoiceConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'temp_voice', config);
}

export async function getLevelingConfig(guildId: string): Promise<LevelingConfig> {
    const defaultConfig: LevelingConfig = {
        text: {
            enabled: false,
            xpCooldown: 60,
            xpRange: { min: 15, max: 25 },
            xpOnTickets: false,
        },
        voice: {
            xpRange: { min: 25, max: 50 },
            enabled: false,
        },
        scope: {
            mode: "EXEMPT",
            roles: [],
            channels: [],
        },
        levelCap: 40,
        keepLevelOnLeave: false,
        notify: {
            channelId: "",
            scope: "NONE",
            format: "TEXT",
            content: "",
            embed: {},
        },
        imageCard: {
            lineSeparatorColor: "#FFFFFF",
            accentColor: "#5865f2",
            barForegroundColor: "#5865f2",
            barBackgroundColor: "#FFFFFF",
            textColor: "#FFFFFF",
            usernameColor: "#FFFFFF",
            statisticsColor: "#FFFFFF",
            backgroundColor: "#000000",
        }
    }

    const dbLeveling = await getGuildConfigField<any>(guildId, 'leveling');
    if (!dbLeveling) return defaultConfig;

    return {
        ...defaultConfig,
        ...dbLeveling,
    }
}

export async function saveHoneypotConfig(guildId: string, config: HoneypotConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'honeypot', config);
}


export async function getHoneypotConfig(guildId: string): Promise<HoneypotConfig> {
    const defaultConfig: HoneypotConfig = {
        enabled: false,
        channelId: "",
        exemptRoles: [],
        dmd: 3,
        reason: "Sending a message in a honeypot channel",
        duration: null
    }

    const dbHoneypot = await getGuildConfigField<any>(guildId, 'honeypot');
    if (!dbHoneypot) return defaultConfig;

    return {
        ...defaultConfig,
        ...dbHoneypot,
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
        format: "TEXT" as Format,
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
        honeypot: { ...default_template },
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
        honeypot: { ...default_template, ...(dbConfig.honeypot || {}) },
    };
}

export async function getTempVoiceChannelConfig(guildId: string): Promise<TempVoiceConfig> {
    const default_template: TempVoiceConfig = {
        hubChannelId: "",
        categoryId: "",
        defaultLimit: 30,
        defaultName: "{user.display_name}'s Temp Channel",
    }

    const dbConfig = await getGuildConfigField<any>(guildId, 'temp_voice');
    if (!dbConfig) return default_template;

    return {
        ...default_template,
        ...dbConfig,
    };
}

export async function getTicketConfig(guildId: string): Promise<TicketConfig> {
    const defaultConfig = {
        categoryId: "",
        enabled: false,
        channelId: "",
        format: "TEXT",
        content: "",
        embed: {},
        postedMessageId: "",
        ticketRoleId: "",
        warnThreshold: 30,
        deleteThreshold: 45,
        bumpEvery: 20,
    }

    const defaultMessageConfig: MessageLayout = {
        enabled: false,
        format: "TEXT",
        content: "",
        embed: {},
    }

    const dbConfig = await getGuildConfigField<any>(guildId, 'tickets');

    // Ensure dbConfig is an object to prevent errors when destructuring
    const safeDbConfig = dbConfig ?? {};

    return {
        ...defaultConfig,
        ...safeDbConfig,
        welcomeMessage: {
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


export async function getBadWordRulesets(guildId: string): Promise<BadWordRuleset[]> {
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

export async function saveBadWordRuleset(
    guildId: string,
    ruleset: Omit<BadWordRuleset, 'created_at' | 'updated_at' | 'guild_id' | 'id'> & { id?: string }
): Promise<BadWordRuleset> {
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
        ruleset.timeout_duration_seconds,
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

export interface InviteTrackerConfig {
    enabled: boolean;
}

export interface LeaderboardEntry {
    inviterId: string;
    count: number;
}

/**
 * Retrieves the invite tracker settings from the JSONB settings object
 */
export async function getInviteTrackerConfig(guildId: string): Promise<InviteTrackerConfig> {
    const defaultConfig: InviteTrackerConfig = {
        enabled: false,
    };

    const dbConfig = await getGuildConfigField<Partial<InviteTrackerConfig>>(guildId, "invite_tracker");
    if (!dbConfig) return defaultConfig;

    return {
        ...defaultConfig,
        ...dbConfig,
    };
}

/**
 * Saves the invite tracker settings to the JSONB settings object
 */
export async function saveInviteTrackerConfig(guildId: string, config: InviteTrackerConfig): Promise<void> {
    await saveGuildConfigField(guildId, "invite_tracker", config);
}

/**
 * Fetches the top inviters from the inviter_counts table
 */
export async function getInviteLeaderboard(guildId: string, limit = 10): Promise<LeaderboardEntry[]> {
    try {
        const query = `
            SELECT inviter_id::TEXT AS "inviterId",
                   count::INTEGER   AS "count"
            FROM inviter_counts
            WHERE guild_id = $1
            ORDER BY count DESC
            LIMIT $2
        `;
        const res = await db.query(query, [guildId, limit]);
        return res.rows;
    } catch (error) {
        console.error("Failed to fetch invite leaderboard:", error);
        return [];
    }
}

export async function getMemberCounterConfig(guildId: string): Promise<MemberCounterConfig> {
    const defaultConfig: MemberCounterConfig = {
        enabled: false,
        updateIntervalMinutes: 15,
        counters: [],
    };

    const dbConfig = await getGuildConfigField<Partial<MemberCounterConfig>>(guildId, "member_counter");
    if (!dbConfig) return defaultConfig;

    return {
        ...defaultConfig,
        ...dbConfig,
    };
}

export async function saveMemberCounterConfig(guildId: string, config: MemberCounterConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'member_counter', config);
}

export async function getRaidDetectionConfig(guildId: string): Promise<RaidDetectionConfig> {
    const defaultConfig: RaidDetectionConfig = {
        raidActions: [],
        enabled: false,
        zScoreMultiplier: 3,
        minSafeLimit: 5,
        windowSizeSeconds: 60,
    }

    const dbConfig = await getGuildConfigField<Partial<RaidDetectionConfig>>(guildId, "raid_detection");
    if (!dbConfig) return defaultConfig;

    return {
        ...defaultConfig,
        ...dbConfig,
    }
}

export async function saveRaidDetectionConfig(guildId: string, config: RaidDetectionConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'raid_detection', config);

    const statsCacheKey = `guild:${guildId}:stats_cache`;
    try {
        await redis.del(statsCacheKey);
    } catch (err) {
        console.error("Failed to invalidate raid stats cache", err);
    }
}
