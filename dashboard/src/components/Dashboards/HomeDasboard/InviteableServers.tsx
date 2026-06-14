import { DiscordGuild } from "@/types";
import { ServerButton } from "@/components/Dashboards/HomeDasboard/ServerButton";

export function InviteableServers({ inviteableGuilds }: { inviteableGuilds: DiscordGuild[] }) {
    return (
        <div className="mt-4">
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