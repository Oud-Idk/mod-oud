import redis from "@/utils/init/redis";
import { DiscordChannel, DiscordGuildDetails } from "@/types";
import { DiscordRole } from "@/components/Dashboards/Welcome/WelcomeBody";

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

export async function getChannelMap(guildId: string): Promise<Record<string, string>> {
    const cacheKey = `guild:${guildId}:channels`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;
    } catch (redisError) {
        console.error("Failed to read channel cache from Redis:", redisError);
    }

    const token = process.env.DISCORD_TOKEN;
    if (!token) return {};

    try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
            headers: { Authorization: `Bot ${token}` },
            next: { revalidate: 300 }
        });

        if (!res.ok) throw new Error(`Discord API returned status ${res.status}`);

        const channels: Array<{ id: string; name: string; type: number }> = await res.json();
        const channelMap = channels.reduce<Record<string, string>>((acc, channel) => {
            if (channel.type !== 4 && channel.type !== 2 && channel.type !== 13) {
                acc[channel.id] = channel.name;
            }
            return acc;
        }, {});

        try {
            await redis.set(cacheKey, JSON.stringify(channelMap), "EX", 300);
        } catch (redisError) {
            console.error("Failed to write channel cache to Redis:", redisError);
        }

        return channelMap;
    } catch (err) {
        console.error("Failed to fetch channels from Discord API:", err);
        return {};
    }
}

export async function getRoleMap(guildId: string): Promise<Record<string, string>> {
    const cacheKey = `guild:${guildId}:roles`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;
    } catch (redisError) {
        console.error("Failed to read role cache from Redis:", redisError);
    }

    const token = process.env.DISCORD_TOKEN;
    if (!token) return {};

    try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers: { Authorization: `Bot ${token}` },
            next: { revalidate: 300 }
        });

        if (!res.ok) throw new Error(`Discord API returned status ${res.status}`);

        const roles: Array<{ id: string; name: string }> = await res.json();
        const roleMap = roles.reduce<Record<string, string>>((acc, role) => {
            acc[role.id] = role.name;
            return acc;
        }, {});

        try {
            await redis.set(cacheKey, JSON.stringify(roleMap), "EX", 300);
        } catch (redisError) {
            console.error("Failed to write role cache to Redis:", redisError);
        }

        return roleMap;
    } catch (err) {
        console.error("Failed to fetch roles from Discord API:", err);
        return {};
    }
}