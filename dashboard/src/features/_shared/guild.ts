import { auth } from "@/lib/auth";
import { getGuildLists } from "@/features/_shared/servers";
import { db } from "@/lib/db";
import redis from "@/lib/redis";

export interface DiscordGuild {
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
}

export interface GuildLists {
    mutualGuilds: DiscordGuild[];
    inviteableGuilds: DiscordGuild[];
}

/**
 * Authenticates the user and verifies if they have management permissions
 * for the given guild where the bot is also present.
 */
export async function verifyGuildAccess(guildId: string) {
    const session = await auth();

    if (!session || !session.user) {
        throw new Error("Unauthorized: Please sign in.");
    }

    const accessToken = session.accessToken as string | undefined;
    if (!accessToken) {
        throw new Error("Unauthorized: Missing access token.");
    }

    const { mutualGuilds } = await getGuildLists(accessToken);

    const hasAccess = mutualGuilds.some((guild) => guild.id === guildId);
    if (!hasAccess) {
        throw new Error("Forbidden: You do not have permission to manage this server or the bot is not present.");
    }

    return session.user;
}

/**
 * Generic JSONB settings getter
 */
export async function getGuildConfigField<T>(guildId: string, key: string): Promise<T | null> {
    const query = `
        SELECT settings -> $2 AS config
        FROM guild_configs
        WHERE guild_id = $1
    `;
    const res = await db.query(query, [guildId, key]);
    return res.rows[0]?.config || null;
}

/**
 * Generic JSONB settings upsert
 */
export async function saveGuildConfigField<T>(guildId: string, key: string, value: T): Promise<void> {
    const query = `
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, JSONB_BUILD_OBJECT($2::TEXT, $3::JSONB))
        ON CONFLICT (guild_id) DO UPDATE
            SET settings = JSONB_SET(
                    COALESCE(guild_configs.settings, '{}'::JSONB),
                    ARRAY [$2::TEXT],
                    $3::JSONB
                           );
    `;
    await db.query(query, [guildId, key, JSON.stringify(value)]);

    const cacheKey = `config:guild:${guildId}`;
    try {
        await redis.del(cacheKey);

        await redis.publish("config_updates", `invalidate:${guildId}`);
    } catch (redisError) {
        console.error(`Failed to clear cache for guild ${guildId}:`, redisError);
    }
}