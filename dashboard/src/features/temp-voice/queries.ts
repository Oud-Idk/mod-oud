import { config } from "@/config"
import { db } from "@/lib/db";
import {
    tempVoiceHubSchema,
    type SaveTempVoiceHubInput,
    type TempVoiceHub,
} from "./types";

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
    hub: SaveTempVoiceHubInput
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
        RETURNING *;
    `;
    const res = await db.query(query, [
        hub.id ?? null,
        guildId,
        hub.name,
        hub.hub_channel_id,
        hub.category_id,
        hub.user_limit ?? null,
        hub.interface_channel_id ?? null,
        hub.default_channel_name,
    ]);

    return tempVoiceHubSchema.parse(res.rows[0]);
}

interface DeleteHubRow {
    category_id: string;
}


export async function deleteTempVoiceHub(guildId: string, hubId: string): Promise<void> {
    const query = `DELETE
                   FROM temp_voice_hubs
                   WHERE id = $1
                     AND guild_id = $2
                   RETURNING category_id;`;

    const dbRes = await db.query<DeleteHubRow>(query, [hubId, guildId]);

    if (dbRes.rows.length > 0) {
        const categoryId = dbRes.rows[0].category_id;

        const backendUrl = config.backendInternalUrl;
        const res = await fetch(`${backendUrl}/api/guilds/${guildId}/category/delete-entire`, {
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