import { ServerButton } from "@/features/overview/components/ServerButton";
import { DiscordGuild } from "@/features/_shared/guild";
import { JSX } from "react";

export function MutualServers({ mutualGuilds }: { mutualGuilds: DiscordGuild[] }): JSX.Element {
    return <div>
        <h2 className="text-xl font-bold">
            Select an Active Server to Configure </h2>
        <div className="flex flex-col gap-3 mt-4">
            {mutualGuilds.map((guild) => {
                return <ServerButton key={guild.id} guild={guild}/>;
            })}
        </div>
    </div>
}