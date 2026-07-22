import { db } from "@/utils/init/db"
import redis from "@/utils/init/redis";
import { StarboardConfig, StarboardConfigInput } from "@/types/db/starboard";

function formatInterval(interval: any): string | null {
    if (!interval) return null;

    // If it's already a string, return as is
    if (typeof interval === 'string') return interval;

    // If it's an object from PostgreSQL, convert it to a readable string
    if (typeof interval === 'object') {
        const parts: string[] = [];

        if (interval.years) parts.push(`${interval.years} year${interval.years > 1 ? 's' : ''}`);
        if (interval.months) parts.push(`${interval.months} month${interval.months > 1 ? 's' : ''}`);
        if (interval.days) parts.push(`${interval.days} day${interval.days > 1 ? 's' : ''}`);
        if (interval.hours) parts.push(`${interval.hours} hour${interval.hours > 1 ? 's' : ''}`);
        if (interval.minutes) parts.push(`${interval.minutes} minute${interval.minutes > 1 ? 's' : ''}`);
        if (interval.seconds) parts.push(`${interval.seconds} second${interval.seconds > 1 ? 's' : ''}`);

        return parts.length > 0 ? parts.join(' ') : null;
    }

    return null;
}

function mapRowToConfig(row: any): StarboardConfig {
    return {
        id: row.id.toString(),
        guild_id: row.guild_id,
        starboard_channel_id: row.starboard_channel_id,
        emojis: row.emojis,
        reaction_threshold: row.reaction_threshold,
        min_message_age: formatInterval(row.min_message_age),
        max_message_age: formatInterval(row.max_message_age),
        prevent_self_star: row.prevent_self_star,
        allow_bot_messages: row.allow_bot_messages,
        role_restriction_type: row.role_restriction_type,
        restricted_roles: row.restricted_roles || [],
        channel_restriction_type: row.channel_restriction_type,
        restricted_channels: row.restricted_channels || [],
        created_at: row.created_at,
        updated_at: row.updated_at,
        embed_template: row.embed_template,
        plaintext_template: row.plaintext_template,
        keep_deleted_messages: row.keep_deleted_messages,
    };
}

export async function getStarboardConfigs(guildId: string): Promise<StarboardConfig[]> {
    const query = `
        SELECT *
        FROM starboards
        WHERE guild_id = $1
        ORDER BY created_at;
    `;
    try {
        const res = await db.query(query, [guildId]);
        return res.rows.map(mapRowToConfig);
    } catch (error) {
        console.error(`Error fetching starboards for guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Saves a starboard configuration. Updates an existing record if config.id is
 * provided, otherwise inserts a new record.
 */
export async function upsertStarboardConfig(
    guildId: string,
    config: StarboardConfigInput
): Promise<StarboardConfig> {
    const isUpdate = !!config.id;
    let dbRow: any;

    if (isUpdate) {
        const updateQuery = `
            UPDATE starboards
            SET starboard_channel_id     = $1,
                emojis                   = $2,
                reaction_threshold       = $3,
                min_message_age          = $4,
                max_message_age          = $5,
                prevent_self_star        = $6,
                allow_bot_messages       = $7,
                role_restriction_type    = $8,
                restricted_roles         = $9,
                channel_restriction_type = $10,
                restricted_channels      = $11,
                embed_template           = $12,
                plaintext_template       = $13,
                keep_deleted_messages    = $14,
                updated_at               = CURRENT_TIMESTAMP
            WHERE id = $15
              AND guild_id = $16
            RETURNING *;
        `;
        const values = [
            config.starboard_channel_id,
            config.emojis || ['⭐'],
            config.reaction_threshold ?? 3,
            config.min_message_age || null,
            config.max_message_age || null,
            config.prevent_self_star ?? true,
            config.allow_bot_messages ?? false,
            config.role_restriction_type || 'NONE',
            config.restricted_roles || [],
            config.channel_restriction_type || 'NONE',
            config.restricted_channels || [],
            config.embed_template || {},
            config.plaintext_template || '',
            config.keep_deleted_messages ?? true,
            config.id,
            guildId
        ];

        try {
            const res = await db.query(updateQuery, values);
            if (res.rows.length === 0) {
                throw new Error(`Starboard configuration with ID ${config.id} not found for guild ${guildId}`);
            }
            dbRow = res.rows[0];
        } catch (error) {
            console.error(`Error updating starboard ${config.id}:`, error);
            throw error;
        }
    } else {
        const insertQuery = `
            INSERT INTO starboards (guild_id,
                                    starboard_channel_id,
                                    emojis,
                                    reaction_threshold,
                                    min_message_age,
                                    max_message_age,
                                    prevent_self_star,
                                    allow_bot_messages,
                                    role_restriction_type,
                                    restricted_roles,
                                    channel_restriction_type,
                                    restricted_channels,
                                    embed_template,
                                    plaintext_template,
                                    keep_deleted_messages)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *;
        `;
        const values = [
            guildId,
            config.starboard_channel_id,
            config.emojis || ['⭐'],
            config.reaction_threshold ?? 3,
            config.min_message_age || null,
            config.max_message_age || null,
            config.prevent_self_star ?? true,
            config.allow_bot_messages ?? false,
            config.role_restriction_type || 'NONE',
            config.restricted_roles || [],
            config.channel_restriction_type || 'NONE',
            config.restricted_channels || [],
            config.embed_template || {},
            config.plaintext_template || '',
            config.keep_deleted_messages ?? true,
        ];

        try {
            const res = await db.query(insertQuery, values);
            dbRow = res.rows[0];
        } catch (error) {
            console.error(`Error inserting new starboard config:`, error);
            throw error;
        }
    }

    try {
        const cacheKey = `starboard:config:${guildId}`;
        await redis.del(cacheKey);
    } catch (redisError) {
        console.error(`Failed to invalidate starboard cache for guild ${guildId}:`, redisError);
    }

    return mapRowToConfig(dbRow);
}


export async function deleteStarboardConfig(id: string, guildId: string): Promise<boolean> {
    const query = `
        DELETE
        FROM starboards
        WHERE id = $1
          AND guild_id = $2
        RETURNING id;
    `;

    try {
        const res = await db.query(query, [id, guildId]);
        const deleted = (res.rowCount ?? 0) > 0;

        // Only invalidate the cache if a configuration was actually removed
        if (deleted) {
            try {
                const cacheKey = `starboard:config:${guildId}`;
                await redis.del(cacheKey);
            } catch (redisError) {
                console.error(`Failed to invalidate starboard cache for guild ${guildId}:`, redisError);
            }
        }

        return deleted;
    } catch (error) {
        console.error(`Error deleting starboard config ${id} for guild ${guildId}:`, error);
        throw error;
    }
}