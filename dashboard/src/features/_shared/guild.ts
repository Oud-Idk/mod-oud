import { auth } from "@/lib/auth";
import { getGuildLists } from "@/features/_shared/servers";
import { db } from "@/lib/db";
import redis from "@/lib/redis";
import { User } from "next-auth";

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
export async function verifyGuildAccess(guildId: string): Promise<User> {
    const session = await auth();

    if (!session?.user) {
        throw new Error("Unauthorized: Please sign in.");
    }

    const accessToken = session.accessToken;
    if (accessToken === undefined) {
        throw new Error("Unauthorized: Missing access token.");
    }

    if (!(await userManagesGuild(accessToken, guildId))) {
        throw new Error("Forbidden: You do not have permission to manage this server or the bot is not present.");
    }

    return session.user;
}

/**
 * The non-throwing form of {@link verifyGuildAccess}, for route boundaries.
 *
 * Pages and layouts cannot handle a thrown error, and a thrown error reads as a 500 rather than a
 * refusal, so they ask for a boolean and render a not-found instead.
 *
 * `getGuildLists` is wrapped in `React.cache`, so a layout and the page beneath it fetch only once,
 * and it reports a lookup failure as an empty list, which lands here as "no access".
 */
export async function currentUserManagesGuild(guildId: string): Promise<boolean> {
    const session = await auth();
    const accessToken = session?.accessToken;

    if (!session?.user || accessToken === undefined) {
        return false;
    }

    return userManagesGuild(accessToken, guildId);
}

async function userManagesGuild(accessToken: string, guildId: string): Promise<boolean> {
    const { mutualGuilds } = await getGuildLists(accessToken);
    return mutualGuilds.some((guild) => guild.id === guildId);
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
    const res = await db.query<{ config: T | null }>(query, [guildId, key]);

    if (res.rows.length === 0) {
        return null;
    }

    return res.rows[0].config ?? null;
}

/**
 * Generic JSONB settings upsert (Shallow Merge)
 *
 * Uses the Postgres || operator to merge new frontend config
 * over the existing config, preserving backend-only keys like category_id.
 */
/**
 * Collects every Discord channel snowflake embedded in a config value.
 *
 * Keys are matched loosely (anything containing "channel") and values are only
 * collected when they look like channel snowflakes, so free-text fields such as
 * channel names are never mistaken for IDs.
 */
function collectChannelIds(value: unknown, key: string, into: Set<string>): void {
    if (value === null || value === undefined) return;

    if (typeof value === "string" || typeof value === "number") {
        const strVal = String(value);
        // Discord snowflakes are 17-20 digits. This avoids false positives on limits/counts.
        const isSnowflake = /^\d{17,20}$/.test(strVal);
        const isChannelKey = /(?:^|_|(?<=[a-z]))channel(?:s|_?id)?$/i.test(key);

        if (isChannelKey && isSnowflake) {
            into.add(strVal);
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectChannelIds(item, key, into);
        }
        return;
    }

    if (typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            collectChannelIds(v, k, into);
        }
    }
}

/**
 * Refuses to persist a config that references a channel outside of `guildId`.
 *
 * The bot resolves stored channel IDs with its own credentials, so a manager of one
 * guild could otherwise aim delivery at another guild's channel.
 */
async function assertChannelsBelongToGuild(guildId: string, value: unknown): Promise<void> {
    const channelIds = new Set<string>();
    collectChannelIds(value, "", channelIds);
    if (channelIds.size === 0) return;

    const token = process.env.DISCORD_TOKEN;
    if (token === undefined || token === "") {
        throw new Error("DISCORD_TOKEN is not configured.");
    }

    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${token}` },
        next: { revalidate: 30 },
    });

    if (!response.ok) {
        throw new Error("Could not verify channel ownership.");
    }

    const rawData: unknown = await response.json();
    const validIds = new Set(
        Array.isArray(rawData) ? rawData.map((channel: { id?: unknown }) => String(channel?.id)) : []
    );

    for (const channelId of channelIds) {
        if (!validIds.has(channelId)) {
            throw new Error("That channel does not belong to this server.");
        }
    }
}

export async function saveGuildConfigField(guildId: string, key: string, value: unknown): Promise<void> {
    await assertChannelsBelongToGuild(guildId, value);

    const query = `
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, JSONB_BUILD_OBJECT($2::TEXT, $3::JSONB))
        ON CONFLICT (guild_id) DO UPDATE
            SET settings = JSONB_SET(
                    COALESCE(guild_configs.settings, '{}'::JSONB),
                    ARRAY[$2::TEXT],
                    CASE
                        -- Only merge if existing key is a valid JSON Object
                        WHEN jsonb_typeof(guild_configs.settings -> $2::TEXT) = 'object'
                            THEN (guild_configs.settings -> $2::TEXT) || $3::JSONB
                        -- Otherwise replace cleanly (prevents array conversion)
                        ELSE $3::JSONB
                        END
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

/**
 * Full-replace variant of {@link saveGuildConfigField}.
 *
 * Overwrites the whole JSONB key instead of shallow-merging, so it can remove
 * nested properties (merging can only add or overwrite, never delete). Use
 * sparingly — only when the caller owns the entire object.
 */
export async function replaceGuildConfigField(guildId: string, key: string, value: unknown): Promise<void> {
    await assertChannelsBelongToGuild(guildId, value);

    const query = `
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, JSONB_BUILD_OBJECT($2::TEXT, $3::JSONB))
        ON CONFLICT (guild_id) DO UPDATE
            SET settings = JSONB_SET(
                    COALESCE(guild_configs.settings, '{}'::JSONB),
                    ARRAY[$2::TEXT],
                    $3::JSONB,
                    true
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