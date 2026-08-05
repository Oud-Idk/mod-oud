import { db } from "@/lib/db";
import { z } from "zod";
import {
    TempVoiceHub,
    tempVoiceHubSchema,
    saveTempVoiceHubInputSchema,
    SaveTempVoiceHubInput
} from "@/features/temp-voice/types";

export async function getTempVoiceHubs(guildId: string): Promise<TempVoiceHub[]> {
    const validGuildId = z.string().parse(guildId);

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
    const res = await db.query(query, [validGuildId]);

    return z.array(tempVoiceHubSchema).parse(res.rows);
}

export async function saveTempVoiceHub(
    guildId: string,
    hubPayload: SaveTempVoiceHubInput
): Promise<TempVoiceHub> {
    const validGuildId = z.string().parse(guildId);
    const validHub = saveTempVoiceHubInputSchema.parse(hubPayload);

    const query = `
        INSERT INTO temp_voice_hubs (id, guild_id, name, hub_channel_id, category_id, user_limit, interface_channel_id,
                                     default_channel_name)
        VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE
            SET name                 = EXCLUDED.name,
                hub_channel_id       = EXCLUDED.hub_channel_id,
                category_id          = EXCLUDED.category_id,
                user_limit           = EXCLUDED.user_limit,
                interface_channel_id = EXCLUDED.interface_channel_id
        RETURNING *;
    `;
    const res = await db.query(query, [
        validHub.id || null,
        validGuildId,
        validHub.name || 'Default Hub',
        validHub.hub_channel_id,
        validHub.category_id,
        validHub.user_limit ?? null,
        validHub.interface_channel_id ?? null,
        validHub.default_channel_name,
    ]);

    return tempVoiceHubSchema.parse(res.rows[0]);
}

export async function deleteTempVoiceHub(guildId: string, hubId: string): Promise<void> {
    const validGuildId = z.string().parse(guildId);
    const validHubId = z.string().parse(hubId);

    const query = `DELETE
                   FROM temp_voice_hubs
                   WHERE id = $1
                     AND guild_id = $2
                   RETURNING category_id;`;
    const dbRes = await db.query(query, [validHubId, validGuildId]);

    if (dbRes.rows.length > 0) {
        const categoryId = z.string().parse(dbRes.rows[0].category_id);

        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
        const res = await fetch(`${backendUrl}/api/guilds/${validGuildId}/category/delete-entire`, {
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
    } else {
        console.log("No matching record was found to delete.");
    }
}