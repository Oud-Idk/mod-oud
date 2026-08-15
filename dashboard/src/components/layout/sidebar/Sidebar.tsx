import React, { JSX } from "react";

import { auth } from "@/lib/auth";
import { User } from "lucide-react";
import { LogoutButton } from "@/components/layout/sidebar/LogoutButton";
import { ServerList } from "@/components/layout/sidebar/ServerList";
import { getGuildLists } from "@/features/_shared/servers";
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SidebarLinks } from "@/components/layout/sidebar/SidebarLinks";
import { DiscordGuild } from "@/features/_shared/guild";

export async function Sidebar(): Promise<JSX.Element> {
    const session = await auth();
    let mutualGuilds: DiscordGuild[] = [];

    if (session?.accessToken !== undefined) {
        const { mutualGuilds: fetchedGuilds } = await getGuildLists(session.accessToken);
        mutualGuilds = fetchedGuilds;
    }

    return (
        <aside
            className="w-64 h-screen border-r bg-white dark:bg-black flex flex-col"
        >
            {/* Fixed Header */}
            <div
                className="flex justify-between items-center px-2 pl-4 mt-3 mb-1 bg-white dark:bg-black shrink-0"
            >
                <Link href="/" className="font-bold">Mod Oud</Link>
                <div className="hidden md:block">
                    <ThemeToggle/>
                </div>
            </div>

            {/* Fixed Server List */}
            <div
                className="h-14 flex justify-start items-center bg-white dark:bg-black shrink-0"
            >
                <ServerList guilds={mutualGuilds}/>
            </div>

            {/* Scrollable Navigation Area */}
            <div className="grow overflow-y-auto min-h-0">
                <SidebarLinks/>
            </div>

            {/* Fixed Footer */}
            <div
                className="p-3 dark:bg-neutral-950 bg-white flex items-center justify-between border-t shrink-0"
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className="relative">
                        {(typeof session?.user.image === "string" ) ? (
                            <img
                                src={session.user.image}
                                alt={(typeof session.user.name === "string" ? session.user.name : "Avatar")}
                                className="w-9 h-9 rounded-full object-cover"
                            />
                        ) : (
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center"
                            >
                                <User className="w-5 h-5"/>
                            </div>
                        )}
                    </div>
                    <div
                        className="flex flex-col overflow-hidden text-left"
                    >
                        <span className="text-md font-semibold truncate">
                            {session?.user.name ?? "Discord User"}
                        </span>
                    </div>
                </div>
                <LogoutButton/>
            </div>
        </aside>
    );
}