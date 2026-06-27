import { db } from "@/utils/init/db";
import { QueryResult } from "pg";

export interface UserLevel {
    guild_id: string;
    user_id: string;
    cumulative_xp: number;
    current_level: number;
    current_xp: number;
    username: string;
}

export async function getLevels(guildId: string): Promise<UserLevel[]> {
    const query = `
        SELECT *
        FROM levels
        WHERE guild_id = $1
        ORDER BY cumulative_xp DESC
        LIMIT 40;
    `;
    try {
        const res = await db.query(query, [guildId]);
        return res.rows;
    } catch (error) {
        console.error(`Error fetching levels for guild ${guildId}:`, error);
        throw error;
    }
}

export async function fetchMoreLevels(guildId: string, currentLowestXp: number): Promise<UserLevel[]> {
    const query = `
        SELECT *
        FROM levels
        WHERE guild_id = $1
          AND cumulative_xp < $2
        ORDER BY cumulative_xp DESC
        LIMIT 20;
    `;
    try {
        const res: QueryResult = await db.query(query, [guildId, currentLowestXp]);
        return res.rows;
    } catch (err) {
        console.error("Failed to fetch lower levels for guild:", err);
        return [];
    }
}