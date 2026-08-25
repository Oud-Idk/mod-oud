import Link from "next/link";
import { DiscordGuild } from "@/features/_shared/guild";
import { JSX } from "react";
import Image from "next/image";
import { ChevronRight } from "lucide-react";

export function ServerButton({
    guild,
    isInvite
}: {
    guild: DiscordGuild;
    isInvite?: boolean;
}): JSX.Element {
    const permissions = process.env.PERMISSION;
    const authDiscordId = process.env.AUTH_DISCORD_ID;
    const guildId = guild.id;

    if (permissions === undefined || authDiscordId === undefined) {
        return (
            <div
                className="p-3 text-xs text-danger bg-danger-subtle border border-danger-border rounded-xl">
                Config(s) not found. Please contact bot hoster.
            </div>
        );
    }

    const iconUrl = guild.icon !== null
        ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png`
        : null;

    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${authDiscordId}&permissions=${permissions}&integration_type=0&scope=bot+applications.commands&guild_id=${guildId}&disable_guild_select=true`;

    return (
        <Link
            key={guild.id}
            href={isInvite ? inviteUrl : `/dashboard/${guild.id}`}
            target={isInvite ? "_blank" : undefined}
            rel={isInvite ? "noopener noreferrer" : undefined}
            className="group relative flex items-center justify-between p-3.5 rounded-xl bg-surface-muted border border-border hover:border-brand/50 hover:bg-surface-active transition-all duration-200 shadow-sm hover:shadow-dropdown focus-ring"
        >
            <div className="flex items-center gap-3.5 min-w-0">
                {iconUrl !== null ? (
                    <div
                        className="relative shrink-0 w-10 h-10 rounded-full overflow-hidden ring-1 ring-border-subtle group-hover:ring-brand/40 transition-all">
                        <Image
                            src={iconUrl}
                            alt={guild.name}
                            className="object-cover"
                            fill
                            sizes="40px"
                        />
                    </div>
                ) : (
                    <div
                        className="shrink-0 w-10 h-10 rounded-full bg-surface text-brand border border-brand/20 flex items-center justify-center font-bold text-sm select-none">
                        {guild.name.charAt(0).toUpperCase()}
                    </div>
                )}

                <div className="flex flex-col min-w-0">
                    <span
                        className="font-semibold text-sm text-foreground truncate transition-colors">
                        {guild.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {isInvite ? "Click to set up bot" : "Server Admin"}
                    </span>
                </div>
            </div>

            <div className="shrink-0 ml-3">
                {!isInvite &&
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all">
                        <ChevronRight className="w-4 h-4" strokeWidth={2.5}/>
                    </div>
                }
            </div>
        </Link>
    );
}