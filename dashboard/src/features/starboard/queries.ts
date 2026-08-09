import { db } from "@/lib/db";
import redis from "@/lib/redis";
import {
    starboardConfigSchema,
    type StarboardConfig,
    type StarboardConfigInput,
} from "./types";

function parseRowEmbed(embedRaw: unknown): Record<string, unknown> {
    if (typeof embedRaw === "string") {
        try {
            return JSON.parse(embedRaw || "{}");
        } catch {
            return {};
        }
    }
    if (typeof embedRaw === "object" && embedRaw !== null) {
        return embedRaw as Record<string, unknown>;
    }
    return {};
}

export async function getStarboardConfigs(guildId: string): Promise<StarboardConfig[]> {
    const res = await db.query(`SELECT * FROM starboards WHERE guild_id = $1`, [guildId] as unknown[]);
    return res.rows.map((row) =>
        starboardConfigSchema.parse({
            ...row,
            embed_template: parseRowEmbed(row.embed_template),
        })
    );
}

export async function upsertStarboardConfig(
    guildId: string,
    config: StarboardConfigInput
): Promise<StarboardConfig> {

    let query: string;
    let values: unknown[];

    if (config.id) {
        query = `
            INSERT INTO starboards (
                id,
                guild_id,
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
                keep_deleted_messages
            )
            VALUES (
                $1::bigint, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            )
            ON CONFLICT (id) DO UPDATE SET
                starboard_channel_id     = EXCLUDED.starboard_channel_id,
                emojis                   = EXCLUDED.emojis,
                reaction_threshold       = EXCLUDED.reaction_threshold,
                min_message_age          = EXCLUDED.min_message_age,
                max_message_age          = EXCLUDED.max_message_age,
                prevent_self_star        = EXCLUDED.prevent_self_star,
                allow_bot_messages       = EXCLUDED.allow_bot_messages,
                role_restriction_type    = EXCLUDED.role_restriction_type,
                restricted_roles         = EXCLUDED.restricted_roles,
                channel_restriction_type = EXCLUDED.channel_restriction_type,
                restricted_channels      = EXCLUDED.restricted_channels,
                embed_template           = EXCLUDED.embed_template,
                plaintext_template       = EXCLUDED.plaintext_template,
                keep_deleted_messages    = EXCLUDED.keep_deleted_messages,
                updated_at               = CURRENT_TIMESTAMP
            RETURNING *;
        `;

        values = [
            config.id,
            guildId,
            config.starboard_channel_id ?? null,
            config.emojis,
            config.reaction_threshold,
            config.min_message_age ?? null,
            config.max_message_age ?? null,
            config.prevent_self_star,
            config.allow_bot_messages,
            config.role_restriction_type,
            config.restricted_roles,
            config.channel_restriction_type,
            config.restricted_channels,
            config.embed_template ? JSON.stringify(config.embed_template) : null,
            config.plaintext_template,
            config.keep_deleted_messages,
        ];
    } else {
        query = `
            INSERT INTO starboards (
                guild_id,
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
                keep_deleted_messages
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            )
            RETURNING *;
        `;

        values = [
            guildId,
            config.starboard_channel_id ?? null,
            config.emojis,
            config.reaction_threshold,
            config.min_message_age ?? null,
            config.max_message_age ?? null,
            config.prevent_self_star,
            config.allow_bot_messages,
            config.role_restriction_type,
            config.restricted_roles,
            config.channel_restriction_type,
            config.restricted_channels,
            config.embed_template ? JSON.stringify(config.embed_template) : null,
            config.plaintext_template,
            config.keep_deleted_messages,
        ];
    }

    const res = await db.query(query, values as unknown[]);

    try {
        await redis.del(`starboard:config:${guildId}`);
    } catch (redisError) {
        console.error(`Failed to invalidate starboard cache for guild ${guildId}:`, redisError);
    }

    const savedRow = res.rows[0];
    return starboardConfigSchema.parse({
        ...savedRow,
        embed_template: parseRowEmbed(savedRow.embed_template),
    });
}

export async function deleteStarboardConfig(id: string, guildId: string): Promise<boolean> {
    const query = `
        DELETE FROM starboards
        WHERE id = $1::bigint AND guild_id = $2
        RETURNING id;
    `;

    try {
        const res = await db.query<{ id: number | string }>(query, [id, guildId] as unknown[]);
        const deleted = (res.rowCount ?? 0) > 0;

        if (deleted) {
            try {
                await redis.del(`starboard:config:${guildId}`);
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