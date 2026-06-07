"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare } from "lucide-react";

export function SidebarLinks() {
    const params = useParams();
    const pathname = usePathname();

    // Retrieve the active guild_id from dynamic route parameters
    const guildId = params?.guild_id as string | undefined;

    // If there is no active server selected, we can hide the links or render nothing
    if (!guildId) return null;

    const links = [
        {
            name: "Overview",
            href: `/dashboard/${guildId}`,
            icon: LayoutDashboard,
            exact: true,
        },
        {
            name: "Welcome",
            href: `/dashboard/${guildId}/welcome`,
            icon: MessageSquare,
            exact: false,
        },
    ];

    return (
        <nav className="flex flex-col gap-1 p-2">
            {links.map((link) => {
                // Determine if the link is active
                const isActive = link.exact
                    ? pathname === link.href
                    : pathname.startsWith(link.href);

                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isActive
                                ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
                        }`}
                    >
                        <link.icon className="w-4 h-4"/>
                        {link.name}
                    </Link>
                );
            })}
        </nav>
    );
}