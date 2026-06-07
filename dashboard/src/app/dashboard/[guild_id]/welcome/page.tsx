import { WelcomeBody } from "@/components/Welcome/WelcomeBody";
import { db } from "@/lib/init/db";
import { QueryResult } from "pg";
import { DiscordChannel, WelcomeConfig } from "@/types";
import { DashboardHeader } from "@/components/Dashboard/DashboardHeader";
import { revalidatePath } from "next/cache";
import redis from "@/lib/init/redis";
import { auth } from "@/auth";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

async function getWelcomeConfig(guild_id: string): Promise<WelcomeConfig> {
    const default_config: WelcomeConfig = {
        public: {
            enabled: false,
            channel_id: "",
            format: "embed",
            content: "",
            embed: "",
        },
        private: {
            enabled: false,
            format: "embed",
            content: "",
            embed: "",
        }
    };

    const query = `SELECT settings -> 'welcome' AS welcome
                   FROM guild_configs
                   WHERE guild_id = $1`;
    const res: QueryResult<any> = await db.query(query, [guild_id]);
    const row = res.rows[0];

    if (!row || !row.welcome) {
        return default_config;
    }

    const dbWelcome = row.welcome;

    // Legacy fallback: Map old database schema to the new nested format
    if ("send_public_message" in dbWelcome || "channel_id" in dbWelcome) {
        return {
            public: {
                enabled: !!dbWelcome.send_public_message,
                channel_id: dbWelcome.channel_id || "",
                format: dbWelcome.format || "embed",
                content: dbWelcome.content || "",
                embed: dbWelcome.embed || "",
            },
            private: {
                enabled: false,
                format: "embed",
                content: "",
                embed: "",
            }
        };
    }

    // Standard merge for the new nested schema
    return {
        public: {
            ...default_config.public,
            ...(dbWelcome.public || {})
        },
        private: {
            ...default_config.private,
            ...(dbWelcome.private || {})
        }
    };
}

async function getGuildChannels(guild_id: string): Promise<DiscordChannel[]> {
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
            next: { revalidate: 30 } // Cache list for 30 seconds to optimize rate limits
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

async function saveWelcomeConfig(guild_id: string, config: WelcomeConfig): Promise<void> {
    const query = `
        INSERT INTO guild_configs (guild_id, settings)
        VALUES ($1, JSONB_BUILD_OBJECT('welcome', $2::JSONB))
        ON CONFLICT (guild_id) DO UPDATE
            SET settings = JSONB_SET(
                    COALESCE(guild_configs.settings, '{}'::JSONB),
                    '{welcome}',
                    $2::JSONB
                           );
    `;

    await db.query(query, [guild_id, JSON.stringify(config)]);

    const cacheKey = `config:guild:${guild_id}`;

    try {
        await redis.del(cacheKey);
    } catch (redisError) {
        console.error(`Failed to invalidate Redis key "${cacheKey}":`, redisError);
    }
}

export default async function WelcomePage({ params }: PageProps) {
    const { guild_id } = await params;
    const session = await auth();

    const [welcomeConfig, channels] = await Promise.all([
        getWelcomeConfig(guild_id),
        getGuildChannels(guild_id)
    ]);

    const profilePictureUrl = session?.user?.image || undefined;

    const onSave = async (data: WelcomeConfig) => {
        "use server";
        try {
            await saveWelcomeConfig(guild_id, data);
            revalidatePath(`/dashboard/${guild_id}/welcome`);
        } catch (error) {
            console.error("Failed to save welcome config:", error);
            throw new Error("Could not save configuration.");
        }
    };

    return (
        <div>
            <DashboardHeader>Welcome Message</DashboardHeader>
            <div>
                <WelcomeBody
                    welcomeConfig={welcomeConfig}
                    channels={channels}
                    onSave={onSave}
                    profilePictureUrl={profilePictureUrl}
                />
            </div>
        </div>
    );
}