import Link from "next/link";
import { DiscordGuild } from "@/features/_shared/guild";

export function ServerButton({ guild, isInvite }: { guild: DiscordGuild, isInvite?: boolean }) {
    const iconUrl = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
        : null;

    const permissions = process.env.PERMISSION;
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.AUTH_DISCORD_ID}&permissions=${permissions}&integration_type=0&scope=bot+applications.commands&guild_id=${guild.id}&disable_guild_select=true`

    return (
        <Link
            key={guild.id}
            href={isInvite ? inviteUrl : `/dashboard/${guild.id}`}
            className="flex items-center gap-4 p-3 border border-neutral-500 rounded-lg hover:border-[#5865F2] transition-all duration-200 bg-white dark:bg-neutral-900 cursor-pointer group"
        >
            {iconUrl ? (
                <img
                    src={iconUrl}
                    alt={guild.name}
                    className="rounded-full w-8 h-8 shadow-sm"
                />
            ) : (
                <div
                    className="rounded-full w-8 h-8 dark:bg-neutral-800 bg-neutral-200 text-white flex items-center justify-center font-bold"
                >
                    {guild.name.charAt(0)}
                </div>
            )}
            <span
                className="font-semibold group-hover:text-[#5865F2] dark:group-hover:text-indigo-400 transition-colors duration-200"
            >
                {guild.name}
            </span>
        </Link>
    )
}