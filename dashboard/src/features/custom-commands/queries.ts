import { db } from "@/lib/db";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import {
    customCommandSchema,
    customPrefixSchema,
    type CustomCommand,
    type CustomPrefixConfig,
    type SaveCustomCommandData,
} from "./types";

export async function getCustomPrefix(guildId: string): Promise<CustomPrefixConfig> {
    const raw = await getGuildConfigField(guildId, "custom_commands");
    return customPrefixSchema.parse(raw ?? {});
}

export async function saveCustomPrefix(guildId: string, config: CustomPrefixConfig): Promise<void> {
    await saveGuildConfigField(guildId, "custom_commands", config);
}

export async function getCustomCommands(guildId: string): Promise<CustomCommand[]> {
    const query = `
        SELECT id,
               guild_id,
               name,
               COALESCE(description, '')        AS description,
               enabled,
               delete_trigger,
               COALESCE(trigger_anywhere, FALSE) AS trigger_anywhere,
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

    return res.rows.map((row) => customCommandSchema.parse(row));
}

export async function saveCustomCommand(data: SaveCustomCommandData): Promise<CustomCommand> {
    const actionsJson = JSON.stringify(data.actions);

    let query: string;
    let params: unknown[];

    if (data.id !== undefined) {
        query = `
            UPDATE custom_commands
            SET name             = $1,
                description      = $2,
                enabled          = $3,
                delete_trigger   = $4,
                trigger_anywhere = $5,
                cooldown_type    = $6,
                cooldown_seconds = $7,
                allowed_roles    = $8,
                ignored_roles    = $9,
                allowed_channels = $10,
                ignored_channels = $11,
                actions          = $12::JSONB
            WHERE id = $13
              AND guild_id = $14
            RETURNING *;
        `;
        params = [
            data.name,
            data.description ?? null,
            data.enabled,
            data.delete_trigger,
            data.trigger_anywhere,
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
                guild_id, name, description, enabled, delete_trigger, trigger_anywhere,
                cooldown_type, cooldown_seconds, allowed_roles, ignored_roles,
                allowed_channels, ignored_channels, actions
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB)
            RETURNING *;
        `;
        params = [
            data.guild_id,
            data.name,
            data.description ?? null,
            data.enabled,
            data.delete_trigger,
            data.trigger_anywhere,
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

export async function deleteCustomCommand(id: number, guildId: string): Promise<boolean> {
    const res = await db.query(`DELETE FROM custom_commands WHERE id = $1 AND guild_id = $2`, [id, guildId]);
    return (res.rowCount ?? 0) === 1;
}