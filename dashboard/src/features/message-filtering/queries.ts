import { db } from "@/lib/db";
import redis from "@/lib/redis";
import { BadWordRuleset, MessageFilteringConfig } from "@/features/message-filtering/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getMessageFilteringConfig(guildId: string): Promise<MessageFilteringConfig> {
    const default_scope = {
        mode: "EXEMPT" as const,
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

    const dbConfig = await getGuildConfigField<MessageFilteringConfig>(guildId, 'message_filtering');
    if (!dbConfig) return default_config;

    // Merge default configuration with whatever exists in the database
    return {
        badWords: { ...default_config.badWords, ...(dbConfig.badWords || {}) },
        serverInvites: { ...default_config.serverInvites, ...(dbConfig.serverInvites || {}) },
        externalLinks: { ...default_config.externalLinks, ...(dbConfig.externalLinks || {}) },
        excessiveCaps: { ...default_config.excessiveCaps, ...(dbConfig.excessiveCaps || {}) },
        excessiveEmojis: { ...default_config.excessiveEmojis, ...(dbConfig.excessiveEmojis || {}) },
        excessiveSpoilers: { ...default_config.excessiveSpoilers, ...(dbConfig.excessiveSpoilers || {}) },
        excessiveMentions: { ...default_config.excessiveMentions, ...(dbConfig.excessiveMentions || {}) },
        zalgo: { ...default_config.zalgo, ...(dbConfig.zalgo || {}) },
        cryptoAddress: { ...default_config.cryptoAddress, ...(dbConfig.cryptoAddress || {}) },
        antiSpam: { ...default_config.antiSpam, ...(dbConfig.antiSpam || {}) },
        offensiveMessages: { ...default_config.offensiveMessages, ...(dbConfig.offensiveMessages || {}) },
        globalSettings: { ...default_scope, ...(dbConfig.globalSettings || {}) },
    };
}

export async function saveMessageFilteringConfig(guildId: string, config: MessageFilteringConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'message_filtering', config);
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

