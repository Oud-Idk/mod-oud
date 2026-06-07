import React from "react";

import { auth } from "@/auth";
import { User } from "lucide-react";
import { LogoutButton } from "@/components/Sidebar/LogoutButton";
import { ServerList } from "@/components/Sidebar/ServerList";
import { getGuildLists } from "@/lib/servers";
import { DiscordGuild } from "@/types";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarLinks } from "@/components/Sidebar/SidebarLinks";

export async function Sidebar() {
    const session = await auth();
    let mutualGuilds: DiscordGuild[] = [];

    // Fetch data securely on the server
    if (session?.accessToken) {
        const { mutualGuilds: fetchedGuilds } = await getGuildLists(session.accessToken);
        mutualGuilds = fetchedGuilds;
    }

    return (
        <aside
            className="w-64 h-screen border-r bg-neutral-100 dark:bg-black flex flex-col"
        >
            <div
                className="h-16 border-b flex justify-between items-center px-4 bg-white dark:bg-black"
            >
                <Link href="/" className="font-bold">Mod Oud</Link>
                <ThemeToggle/>
            </div>
            <div
                className="h-14 border-b flex justify-start items-center bg-white dark:bg-black"
            >
                <ServerList guilds={mutualGuilds}/>
            </div>
            <div className="grow">
                <SidebarLinks/>
            </div>
            <div
                className="p-3 dark:bg-neutral-950 bg-white flex items-center justify-between border-t">
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className="relative">
                        {session?.user?.image ? (
                            <img
                                src={session.user.image}
                                alt={session.user.name || "Avatar"}
                                className="w-9 h-9 rounded-full object-cover"
                            />
                        ) : (
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5"/>
                            </div>
                        )}
                    </div>
                    <div
                        className="flex flex-col overflow-hidden text-left">
                        <span className="text-md font-semibold truncate">
                          {session?.user?.name || "Discord User"}
                        </span>
                    </div>
                </div>
                <LogoutButton/>
            </div>
        </aside>
    )
}