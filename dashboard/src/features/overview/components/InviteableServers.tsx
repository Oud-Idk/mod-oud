import { ServerButton } from "@/features/overview/components/ServerButton";
import { DiscordGuild } from "@/features/_shared/guild";
import { JSX } from "react";

export function InviteableServers({ inviteableGuilds }: { inviteableGuilds: DiscordGuild[] }): JSX.Element {
    return (
        <div>
            <h2 className="text-xl font-bold">
                Add Bot to Your Servers </h2>
            <div className="flex flex-col gap-3 mt-4">
                {inviteableGuilds.map((guild) => {
                    return <ServerButton key={guild.id} guild={guild} isInvite={true}/>
                })}
            </div>
        </div>
    )
}