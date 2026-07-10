import redis from "@/utils/init/redis";
import { DiscordChannel, DiscordGuildDetails } from "@/types";
import { DiscordRole } from "@/components/Dashboards/Welcome/WelcomeBody";
import { revalidateTag } from "next/cache";

export async function getGuildChannels(guild_id: string): Promise<DiscordChannel[]> {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        console.error("DISCORD_TOKEN is missing in environment variables.");
        return [];
    }

    try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/channels`, {
            headers: {
                Authorization: `Bot ${token}`,
            },
            next: { revalidate: 30 }
        });

        if (!response.ok) {
            throw new Error(`Discord API responded with status ${response.status}`);
        }

        const channels: DiscordChannel[] = await response.json();

        return channels.filter(channel => channel.type === 0 || channel.type === 5);
    } catch (error) {
        console.error(`Failed to fetch channels for guild ${guild_id}:`, error);
        return [];
    }
}

export async function getGuildRoles(guild_id: string): Promise<DiscordRole[]> {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        console.error("DISCORD_TOKEN is missing in environment variables.");
        return [];
    }

    try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/roles`, {
            headers: {
                Authorization: `Bot ${token}`,
            },
            next: { revalidate: 30 }
        });

        if (!response.ok) {
            throw new Error(`Discord API responded with status ${response.status}`);
        }

        const roles: DiscordRole[] = await response.json();

        // Exclude @everyone role (usually has the guild's ID) and managed integration roles (e.g., other bot roles)
        return roles.filter(role => !role.managed && role.id !== guild_id);
    } catch (error) {
        console.error(`Failed to fetch roles for guild ${guild_id}:`, error);
        return [];
    }
}

export async function getGuildDetails(guildId: string): Promise<DiscordGuildDetails | null> {
    const botToken = process.env.DISCORD_TOKEN;
    if (!botToken) return null;

    try {
        const response = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
            {
                headers: { Authorization: `Bot ${botToken}` },
                next: { revalidate: 30 },
            }
        );
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch guild details:", error);
        return null;
    }
}

interface ResourceConfig<T> {
    cacheSuffix: string;
    endpoint: string;
    filter?: (item: T) => boolean;
}

// Reusable fetch and cache helper
async function getGuildResourceMap<T extends { id: string; name: string }>(
    guildId: string,
    config: ResourceConfig<T>
): Promise<Record<string, string>> {
    const { cacheSuffix, endpoint, filter } = config;
    const cacheKey = `guild:${guildId}:${cacheSuffix}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;
    } catch (redisError) {
        console.error(`Failed to read ${cacheSuffix} cache from Redis:`, redisError);
    }

    const token = process.env.DISCORD_TOKEN;
    if (!token) return {};

    try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/${endpoint}`, {
            headers: { Authorization: `Bot ${token}` },
            next: {
                revalidate: 300,
                tags: [`guild-${cacheSuffix}-${guildId}`]
            }
        });

        if (!res.ok) throw new Error(`Discord API returned status ${res.status}`);

        const items: T[] = await res.json();
        const itemMap = items.reduce<Record<string, string>>((acc, item) => {
            if (!filter || filter(item)) {
                acc[item.id] = item.name;
            }
            return acc;
        }, {});

        try {
            await redis.set(cacheKey, JSON.stringify(itemMap), "EX", 300);
        } catch (redisError) {
            console.error(`Failed to write ${cacheSuffix} cache to Redis:`, redisError);
        }

        return itemMap;
    } catch (err) {
        console.error(`Failed to fetch ${cacheSuffix} from Discord API:`, err);
        return {};
    }
}

export async function getTextChannelMap(guildId: string): Promise<Record<string, string>> {
    return getGuildResourceMap<DiscordChannel>(guildId, {
        cacheSuffix: "channels",
        endpoint: "channels",
        filter: (channel) => channel.type !== 4 && channel.type !== 2 && channel.type !== 13
    });
}

export async function getVoiceChannelMap(guildId: string): Promise<Record<string, string>> {
    return getGuildResourceMap<DiscordChannel>(guildId, {
        cacheSuffix: "voice-channels",
        endpoint: "channels",
        filter: (channel) => channel.type === 2
    });
}

export async function getRoleMap(guildId: string): Promise<Record<string, string>> {
    return getGuildResourceMap<{ id: string; name: string }>(guildId, {
        cacheSuffix: "roles",
        endpoint: "roles"
    });
}

export async function getCategoryMap(guildId: string): Promise<Record<string, string>> {
    return getGuildResourceMap<DiscordChannel>(guildId, {
        cacheSuffix: "categories",
        endpoint: "channels",
        filter: (channel) => channel.type === 4
    });
}

export async function invalidateGuildChannelCache(guildId: string): Promise<void> {
    try {
        const keysToDelete = [
            `guild:${guildId}:categories`,
            `guild:${guildId}:voice-channels`,
            `guild:${guildId}:channels`
        ];
        await redis.del(keysToDelete);
    } catch (redisError) {
        console.error(`Failed to invalidate Redis cache for guild ${guildId}:`, redisError);
    }

    revalidateTag(`guild-voice-channels-${guildId}`, 'max');
    revalidateTag(`guild-categories-${guildId}`, 'max');
}