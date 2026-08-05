
import { DiscordGuild, GuildLists } from "@/features/_shared/guild";

function hasManageGuildPermission(permissions: string): boolean {
    try {
        const permBit = BigInt(permissions);
        return (permBit & 0x20n) === 0x20n || (permBit & 0x8n) === 0x8n;
    } catch {
        return false;
    }
}

export async function getGuildLists(userAccessToken: string): Promise<GuildLists> {
    try {
        const [userGuildsRes, botGuildsRes] = await Promise.all([
            fetch("https://discord.com/api/users/@me/guilds", {
                headers: { Authorization: `Bearer ${userAccessToken}` },
                next: { revalidate: 60 }, // Cache user servers for 60 seconds
            }),
            fetch("https://discord.com/api/users/@me/guilds", {
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
                next: { revalidate: 300 }, // Cache bot servers for 5 minutes
            }),
        ]);

        if (!userGuildsRes.ok || !botGuildsRes.ok) {
            return { mutualGuilds: [], inviteableGuilds: [] };
        }

        const userGuilds: DiscordGuild[] = await userGuildsRes.json();
        const botGuilds: DiscordGuild[] = await botGuildsRes.json();

        const mutualGuilds: DiscordGuild[] = [];
        const inviteableGuilds: DiscordGuild[] = [];

        for (const userGuild of userGuilds) {
            const isManager = hasManageGuildPermission(userGuild.permissions);
            if (!isManager) continue;

            const isBotInGuild = botGuilds.some((botGuild) => botGuild.id === userGuild.id);
            if (isBotInGuild) {
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
}