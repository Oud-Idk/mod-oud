import { z } from "zod";
import { db } from "@/lib/db";
import redis from "@/lib/redis";
import {
    BadWordRuleset,
    MessageFilteringConfig,
    SaveableBadWordRuleset,
    badWordRulesetSchema,
    messageFilteringConfigSchema,
    saveBadWordRulesetInputSchema,
} from "@/features/message-filtering/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getMessageFilteringConfig(guildId: string): Promise<MessageFilteringConfig> {
    const validGuildId = z.string().min(1).parse(guildId);
    const dbConfig = await getGuildConfigField(validGuildId, "message_filtering");
    return messageFilteringConfigSchema.parse(dbConfig ?? {});
}

export async function saveMessageFilteringConfig(guildId: string, config: MessageFilteringConfig): Promise<void> {
    await saveGuildConfigField(guildId, "message_filtering", config);
}

export async function getBadWordRulesets(guildId: string): Promise<BadWordRuleset[]> {
    const validGuildId = z.string().min(1).parse(guildId);
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
    const res = await db.query(query, [validGuildId]);
    return z.array(badWordRulesetSchema).parse(res.rows);
}

export async function saveBadWordRuleset(
    guildId: string,
    rawRuleset: SaveableBadWordRuleset
): Promise<BadWordRuleset> {
    const ruleset = saveBadWordRulesetInputSchema.parse(rawRuleset);

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

    const res = await db.query(query, [
        ruleset.id ?? null,
        guildId,
        ruleset.name,
        ruleset.enabled,
        JSON.stringify(ruleset.patterns),
        JSON.stringify(ruleset.actions),
        ruleset.timeoutDurationSeconds ?? null,
        JSON.stringify(ruleset.scope),
    ]);

    // Keep Redis cache in sync
    const cacheKey = `config:guild:${guildId}:bad_words`;
    try {
        await redis.del(cacheKey);
        await redis.publish("config_updates", `invalidate:${guildId}`);
    } catch (redisError) {
        console.error(`Failed to clear cache for guild ${guildId}:`, redisError);
    }

    return badWordRulesetSchema.parse(res.rows[0]);
}

export async function deleteBadWordRuleset(guildId: string, id: string): Promise<void> {
    const query = `
        DELETE
        FROM bad_word_rulesets
        WHERE id = $1
          AND guild_id = $2
    `;
    await db.query(query, [id, guildId]);

    const badWordsCacheKey = `config:guild:${guildId}:bad_words`;

    try {
        await redis.del(badWordsCacheKey);

        const generalCacheKey = `config:guild:${guildId}`;
        await redis.del(generalCacheKey);

        await redis.publish("config_updates", `invalidate:${guildId}:bad_words`);
    } catch (redisError) {
        console.error(`Failed to clear cache for guild ${guildId}:`, redisError);
    }
}