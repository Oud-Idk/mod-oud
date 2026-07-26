import { db } from "@/utils/init/db";
import { CustomCommand } from "@/types/db/customCommand";

export type SaveCustomCommandData = Omit<CustomCommand, "id"> & { id?: number };

export async function getCustomCommands(guildId: string): Promise<CustomCommand[]> {
    const query = `
        SELECT id,
               guild_id,
               name,
               COALESCE(description, '')        AS description,
               enabled,
               delete_trigger,
               cooldown_type,
               cooldown_seconds,
               COALESCE(allowed_roles, '{}')    AS allowed_roles,
               COALESCE(ignored_roles, '{}')    AS ignored_roles,
               COALESCE(allowed_channels, '{}') AS allowed_channels,
               COALESCE(ignored_channels, '{}') AS ignored_channels,
               COALESCE(actions, '[]'::JSONB)   AS actions
        FROM custom_commands
        WHERE guild_id = $1
        ORDER BY id DESC;
    `;
    const res = await db.query(query, [guildId]);
    return res.rows;
}

export async function saveCustomCommand(data: SaveCustomCommandData): Promise<CustomCommand> {
    const actionsJson = JSON.stringify(data.actions || []);

    if (data.id) {
        const query = `
            UPDATE custom_commands
            SET name             = $1,
                description      = $2,
                enabled          = $3,
                delete_trigger   = $4,
                cooldown_type    = $5,
                cooldown_seconds = $6,
                allowed_roles    = $7,
                ignored_roles    = $8,
                allowed_channels = $9,
                ignored_channels = $10,
                actions          = $11::JSONB
            WHERE id = $12
              AND guild_id = $13
            RETURNING *;
        `;

        const res = await db.query(query, [
            data.name,
            data.description || "",
            data.enabled,
            data.delete_trigger,
            data.cooldown_type,
            data.cooldown_seconds,
            data.allowed_roles || [],
            data.ignored_roles || [],
            data.allowed_channels || [],
            data.ignored_channels || [],
            actionsJson,
            data.id,
            data.guild_id,
        ]);

        return res.rows[0];
    } else {
        const query = `
            INSERT INTO custom_commands (guild_id, name, description, enabled, delete_trigger,
                                         cooldown_type, cooldown_seconds, allowed_roles, ignored_roles,
                                         allowed_channels, ignored_channels, actions)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB)
            RETURNING *;
        `;

        const res = await db.query(query, [
            data.guild_id,
            data.name,
            data.description || "",
            data.enabled ?? true,
            data.delete_trigger ?? false,
            data.cooldown_type || "NONE",
            data.cooldown_seconds || 0,
            data.allowed_roles || [],
            data.ignored_roles || [],
            data.allowed_channels || [],
            data.ignored_channels || [],
            actionsJson,
        ]);

        return res.rows[0];
    }
}

export async function deleteCustomCommand(id: number): Promise<boolean> {
    const res = await db.query(`DELETE
                                FROM custom_commands
                                WHERE id = $1`, [id]);
    return res.rowCount === 1;
}