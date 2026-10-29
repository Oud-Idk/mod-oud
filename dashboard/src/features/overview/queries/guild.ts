import {
    DiscordGuildDetails,
    DiscordGuildDetailsSchema,
} from "../types";

export async function getGuildDetails(guildId: string): Promise<DiscordGuildDetails | null> {
    const botToken = process.env.DISCORD_TOKEN;
    if (botToken === undefined || botToken.trim() === "") {
        return null;
    }

    try {
        const response = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
            {
                headers: { Authorization: `Bot ${botToken}` },
                next: { revalidate: 30 },
            }
        );

        if (!response.ok) return null;

        const rawData: unknown = await response.json();

        const result = DiscordGuildDetailsSchema.safeParse(rawData);
        if (!result.success) {
            console.error("Invalid Discord Guild structure:", result.error);
            return null;
        }

        return result.data;
    } catch (error) {
        console.error("Failed to fetch guild details:", error);
        return null;
    }
}
