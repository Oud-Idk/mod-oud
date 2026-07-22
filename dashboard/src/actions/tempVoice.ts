"use server";

import { verifyGuildAccess } from "@/actions/config";
import { invalidateGuildChannelCache } from "@/utils/discord";
import { db } from "@/utils/init/db";
import { revalidatePath } from "next/cache";
import { TempVoiceHub } from "@/types/db";

export interface SetupTempVoicePayload {
    categoryName: string;
    hubChannelName: string;
}

export interface SetupTempVoiceResponse {
    success: boolean;
    categoryId?: string;
    interfaceChannelId?: string;
    hubChannelId?: string;
    error?: string;
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
    return res.rows;
}

export async function saveTempVoiceHub(guildId: string, hub: Partial<TempVoiceHub>): Promise<TempVoiceHub> {
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
        hub.id || null,
        guildId,
        hub.name || 'Default Hub',
        hub.hub_channel_id,
        hub.category_id,
        hub.user_limit ?? null,
        hub.interface_channel_id,
        hub.default_channel_name,
    ]);

    return res.rows[0];
}

export async function deleteTempVoiceHub(guildId: string, hubId: string): Promise<void> {
    const query = `DELETE
                   FROM temp_voice_hubs
                   WHERE id = $1
                     AND guild_id = $2
                   RETURNING category_id;`;
    const dbRes = await db.query(query, [hubId, guildId]);

    if (dbRes.rows.length > 0) {
        const categoryId = dbRes.rows[0].category_id;
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
        const res = await fetch(`${backendUrl}/api/guilds/${guildId}/category/delete-entire`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ category_id: categoryId }),
        });

        if (!res.ok) {
            throw Error(`Failed to delete temp voice hub: ${res.body}`);
        }
    } else {
        console.log("No matching record was found to delete.");

    }
}

export async function saveTempVoiceHubAction(guildId: string, hub: Partial<TempVoiceHub>) {
    try {
        await verifyGuildAccess(guildId);
        const saved = await saveTempVoiceHub(guildId, hub);
        revalidatePath(`/dashboard/${guildId}/temp-voice`);
        return { success: true, hub: saved };
    } catch (error) {
        console.error("Failed to save temporary voice hub:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function deleteTempVoiceHubAction(guildId: string, hubId: string) {
    try {
        await verifyGuildAccess(guildId);
        await deleteTempVoiceHub(guildId, hubId);
        revalidatePath(`/dashboard/${guildId}/temp-voice`);
        return { success: true };
    } catch (error) {
        console.error("Failed to delete temporary voice hub:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete configuration.");
    }
}

export async function setupTempVoiceAction(
    guildId: string,
    payload: SetupTempVoicePayload
): Promise<SetupTempVoiceResponse> {
    try {
        await verifyGuildAccess(guildId);

        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        const response = await fetch(`${backendUrl}/api/guilds/${guildId}/temp-voice/setup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                category_name: payload.categoryName,
                hub_channel_name: payload.hubChannelName,
                user_limit: null,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            return {
                success: false,
                error: errText || "The backend rejected the channel setup.",
            };
        }

        const data = await response.json();

        await invalidateGuildChannelCache(guildId);

        return {
            success: true,
            categoryId: data.category_id,
            hubChannelId: data.hub_channel_id,
            interfaceChannelId: data.interface_channel_id,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Failed to communicate with the backend server.",
        };
    }
}