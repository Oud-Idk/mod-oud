import { backendFetch } from "@/lib/backend";
import { db } from "@/lib/db";
import redis from "@/lib/redis";
import {
    tempVoiceHubSchema,
    type SaveableTempVoiceHub,
    type SaveTempVoiceHubInput,
    type TempVoiceHub,
} from "./types";

/**
 * Drops the hub lookups the bot keeps in Redis for 24h, so a dashboard edit takes effect on the
 * next join instead of the next TTL expiry.
 */
async function invalidateTempVoiceCache(
    guildId: string,
    hubChannelIds: (string | null | undefined)[],
    categoryIds: (string | null | undefined)[]
): Promise<void> {
    const keys = new Set<string>();
    for (const channelId of hubChannelIds) {
        if (channelId !== null && channelId !== undefined && channelId !== "") {
            keys.add(`temp_voice_hub:${guildId}:${channelId}`);
        }
    }
    for (const categoryId of categoryIds) {
        if (categoryId !== null && categoryId !== undefined && categoryId !== "") {
            keys.add(`temp_voice_hub_by_category:${guildId}:${categoryId}`);
        }
    }
    if (keys.size === 0) {
        return;
    }
    try {
        await redis.del(...keys);
    } catch (err) {
        console.error(`Failed to invalidate temp voice cache for guild ${guildId}:`, err);
    }
}

interface ExistingHubPointerRow {
    hub_channel_id: string;
    category_id: string | null;
}

async function getHubPointer(guildId: string, hubId: string): Promise<ExistingHubPointerRow | null> {
    const res = await db.query<ExistingHubPointerRow>(
        `SELECT hub_channel_id, category_id FROM temp_voice_hubs WHERE id = $1 AND guild_id = $2`,
        [hubId, guildId]
    );
    return res.rows[0] ?? null;
}

export async function getTempVoiceHubs(guildId: string): Promise<TempVoiceHub[]> {
    const query = `
        SELECT id,
               guild_id,
               name,
               hub_channel_id,
               category_id,
               user_limit,
               interface_channel_id,
               default_channel_name
        FROM temp_voice_hubs
        WHERE guild_id = $1
        ORDER BY created_at ASC;
    `;
    const res = await db.query(query, [guildId]);
    return res.rows.map((row) => tempVoiceHubSchema.parse(row));
}

export async function saveTempVoiceHub(
    guildId: string,
    hub: SaveTempVoiceHubInput | SaveableTempVoiceHub
): Promise<TempVoiceHub> {
    const query = `
        INSERT INTO temp_voice_hubs (id, guild_id, name, hub_channel_id, category_id, user_limit, interface_channel_id,
                                     default_channel_name)
        VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE
            SET name                 = EXCLUDED.name,
                hub_channel_id       = EXCLUDED.hub_channel_id,
                category_id          = EXCLUDED.category_id,
                user_limit           = EXCLUDED.user_limit,
                interface_channel_id = EXCLUDED.interface_channel_id,
                default_channel_name = EXCLUDED.default_channel_name
            WHERE temp_voice_hubs.guild_id = EXCLUDED.guild_id
        RETURNING *;
    `;
    const normalizedId =
        typeof hub.id === "string" && hub.id.trim() !== "" ? hub.id : null;
    const previous = normalizedId === null ? null : await getHubPointer(guildId, normalizedId);
    const res = await db.query(query, [
        normalizedId,
        guildId,
        hub.name,
        hub.hub_channel_id,
        hub.category_id,
        hub.user_limit ?? null,
        hub.interface_channel_id ?? null,
        hub.default_channel_name,
    ]);

    const saved = tempVoiceHubSchema.parse(res.rows[0]);

    // The previous channel/category keys hold the same hub id with the old targets, so both the
    // old and the new locations have to go.
    await invalidateTempVoiceCache(
        guildId,
        [saved.hub_channel_id, previous?.hub_channel_id],
        [saved.category_id, previous?.category_id]
    );

    return saved;
}

export async function deleteTempVoiceHub(guildId: string, hubId: string): Promise<void> {
    const query = `DELETE
                   FROM temp_voice_hubs
                   WHERE id = $1
                     AND guild_id = $2
                   RETURNING hub_channel_id, category_id;`;

    const dbRes = await db.query<ExistingHubPointerRow>(query, [hubId, guildId]);

    if (dbRes.rows.length > 0) {
        const { hub_channel_id: hubChannelId, category_id: categoryId } = dbRes.rows[0];

        await invalidateTempVoiceCache(guildId, [hubChannelId], [categoryId]);

        const res = await backendFetch(`/api/guilds/${guildId}/category/delete-entire`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ category_id: categoryId }),
        });

        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Failed to delete temp voice hub: ${errorBody}`);
        }
    }
}