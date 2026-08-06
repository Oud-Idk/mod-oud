import { db } from "@/lib/db";
import {
    customCommandSchema,
    saveCustomCommandInputSchema,
    type CustomCommand,
    type SaveCustomCommandData,
} from "./types";

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
               allowed_roles    AS allowed_roles,
               ignored_roles    AS ignored_roles,
               allowed_channels AS allowed_channels,
               ignored_channels AS ignored_channels,
               actions          AS actions
        FROM custom_commands
        WHERE guild_id = $1
        ORDER BY id DESC;
    `;

    const res = await db.query(query, [guildId]);

    return res.rows.map((row) => {
        return customCommandSchema.parse({
            ...row,
            id: row.id !== null && row.id !== undefined ? Number(row.id) : undefined,
        });
    });
}

export async function saveCustomCommand(rawData: SaveCustomCommandData): Promise<CustomCommand> {
    const data = saveCustomCommandInputSchema.parse(rawData);
    const actionsJson = JSON.stringify(data.actions);

    let query: string;
    let params: (string | number | boolean | string[])[];

    if (data.id) {
        query = `
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
        params = [
            data.name,
            data.description ?? "",
            data.enabled,
            data.delete_trigger,
            data.cooldown_type,
            data.cooldown_seconds,
            data.allowed_roles,
            data.ignored_roles,
            data.allowed_channels,
            data.ignored_channels,
            actionsJson,
            data.id,
            data.guild_id,
        ];
    } else {
        query = `
      INSERT INTO custom_commands (
        guild_id, name, description, enabled, delete_trigger,
        cooldown_type, cooldown_seconds, allowed_roles, ignored_roles,
        allowed_channels, ignored_channels, actions
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB)
      RETURNING *;
    `;
        params = [
            data.guild_id,
            data.name,
            data.description ?? "",
            data.enabled,
            data.delete_trigger,
            data.cooldown_type,
            data.cooldown_seconds,
            data.allowed_roles,
            data.ignored_roles,
            data.allowed_channels,
            data.ignored_channels,
            actionsJson,
        ];
    }

    const res = await db.query(query, params);
    return customCommandSchema.parse(res.rows[0]);
}

export async function deleteCustomCommand(id: number): Promise<boolean> {
    const res = await db.query(`DELETE FROM custom_commands WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) === 1;
}