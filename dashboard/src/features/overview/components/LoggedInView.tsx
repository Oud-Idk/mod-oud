import { Session } from "next-auth";
import { JSX } from "react";
import { getGuildLists } from "@/features/_shared/servers";
import { MutualServers } from "@/features/overview/components/MutualServers";
import { InviteableServers } from "@/features/overview/components/InviteableServers";

export async function LoggedInView({ session }: { session: Session | null }): Promise<JSX.Element> {
    const { mutualGuilds, inviteableGuilds } = session?.accessToken !== undefined
        ? await getGuildLists(session.accessToken)
        : { mutualGuilds: [], inviteableGuilds: [] };

    return <div className="flex flex-col gap-4 w-full max-w-7xl mt-4 px-10">
        <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Select a Server </h2>
            <p className="text-sm text-muted-foreground mt-1">
                Choose a server to configure or invite Mod Oud to start protecting. </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {mutualGuilds.length > 0 && (
                <div
                    className="p-5 rounded-xl bg-surface border border-border shadow-sm"
                >
                    <MutualServers mutualGuilds={mutualGuilds}/>
                </div>
            )}

            {inviteableGuilds.length > 0 && (
                <div
                    className="p-5 rounded-xl bg-surface border border-border shadow-sm"
                >
                    <InviteableServers inviteableGuilds={inviteableGuilds}/>
                </div>
            )}
        </div>
    </div>;
}