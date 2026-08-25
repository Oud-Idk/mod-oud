import { cache } from "react";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { DiscordGuild, GuildLists } from "@/features/_shared/guild";

// Schema to safely parse Discord's 429 rate limit payload
const rateLimitResponseSchema = z.object({
    message: z.string().optional(),
    retry_after: z.number().optional(),
    global: z.boolean().optional(),
});

// Schema for Discord Guild objects handling both number and string permissions
const discordGuildSchema = z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    owner: z.boolean().optional(),
    permissions: z
        .union([z.string(), z.number()])
        .optional()
        .transform((val) => (val !== undefined ? String(val) : "0")),
    features: z.array(z.string()).optional(),
});

const discordGuildsArraySchema = z.array(discordGuildSchema);

function hasManageGuildPermission(permissions: string): boolean {
    try {
        const permBit = BigInt(permissions);
        return (permBit & 0x20n) === 0x20n || (permBit & 0x8n) === 0x8n;
    } catch {
        return false;
    }
}

/**
 * Fetch helper with automatic 429 retry support and collision avoidance (jitter)
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
    const res = await fetch(url, options);

    if (res.status === 429 && retries > 0) {
        let retryAfterMs = 1000;

        try {
            const rawJson: unknown = await res.clone().json();
            const parsed = rateLimitResponseSchema.safeParse(rawJson);
            if (parsed.success && parsed.data.retry_after !== undefined) {
                // Discord retry_after is in seconds (float). Convert to ms with a safety buffer
                retryAfterMs = Math.ceil(parsed.data.retry_after * 1000) + 200;
            }
        } catch {
            const headerVal = res.headers.get("Retry-After");
            if (headerVal !== null && headerVal.length > 0) {
                const parsedFloat = parseFloat(headerVal);
                if (!Number.isNaN(parsedFloat)) {
                    retryAfterMs = Math.ceil(parsedFloat * 1000) + 200;
                }
            }
        }

        // Add 50-200ms random jitter so concurrent retries don't hit at the exact same millisecond
        const jitter = Math.floor(Math.random() * 150) + 50;
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs + jitter));

        return fetchWithRetry(url, options, retries - 1);
    }

    return res;
}

/**
 * Fetch bot guilds globally (cached across ALL users for 10 minutes)
 */
const getBotGuildsCached = unstable_cache(
    async (): Promise<DiscordGuild[]> => {
        const botToken = process.env.DISCORD_TOKEN ?? "";
        if (botToken.length === 0) {
            throw new Error("DISCORD_TOKEN environment variable is not defined");
        }

        const res = await fetchWithRetry("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: `Bot ${botToken}` },
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Discord bot guilds fetch failed: ${String(res.status)} ${body}`);
        }

        const rawData: unknown = await res.json();
        return discordGuildsArraySchema.parse(rawData);
    },
    ["discord_bot_guilds"],
    { revalidate: 100, tags: ["bot-guilds"] }
);

/**
 * Fetch user guilds (cached per userAccessToken for 60 seconds)
 */
const getUserGuildsCached = unstable_cache(
    async (token: string): Promise<DiscordGuild[]> => {
        const res = await fetchWithRetry("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Discord user guilds fetch failed: ${String(res.status)} ${body}`);
        }

        const rawData: unknown = await res.json();
        return discordGuildsArraySchema.parse(rawData);
    },
    ["discord_user_guilds"],
    { revalidate: 60 }
);

/**
 * React.cache() ensures that if Sidebar and Page both call this in the same
 * render pass, it only runs once.
 */
export const getGuildLists = cache(async (userAccessToken: string): Promise<GuildLists> => {
    try {
        const [userGuilds, botGuilds] = await Promise.all([
            getUserGuildsCached(userAccessToken),
            getBotGuildsCached(),
        ]);

        const botGuildIdSet = new Set(botGuilds.map((g) => g.id));

        const mutualGuilds: DiscordGuild[] = [];
        const inviteableGuilds: DiscordGuild[] = [];

        for (const userGuild of userGuilds) {
            if (!hasManageGuildPermission(userGuild.permissions)) continue;

            if (botGuildIdSet.has(userGuild.id)) {
                mutualGuilds.push(userGuild);
            } else {
                inviteableGuilds.push(userGuild);
            }
        }

        return { mutualGuilds, inviteableGuilds };
    } catch (error) {
        console.error("Failed to fetch guild lists:", error);
        return { mutualGuilds: [], inviteableGuilds: [] };
    }
});