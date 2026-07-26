"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
    AlertTriangle,
    BellIcon,
    DoorOpen,
    FileText,
    LayoutDashboard,
    LayoutTemplate,
    Logs,
    Megaphone,
    MessageSquare,
    MessageSquareWarning, PartyPopper,
    ScrollTextIcon,
    Skull,
    Star, Terminal,
    Ticket,
    TrendingUp,
    User,
    UserPlus,
    Volume2Icon
} from "lucide-react";
import { FaceSmileIcon } from "@heroicons/react/24/outline";

export function SidebarLinks() {
    const params = useParams();
    const pathname = usePathname();

    const guildId = params?.guild_id as string | undefined;

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
        {
            name: "Leave",
            href: `/dashboard/${guildId}/leave`,
            icon: DoorOpen,
            exact: false,
        },
        {
            name: "Message Logging",
            href: `/dashboard/${guildId}/message-logging`,
            icon: Logs,
            exact: false,
        },
        {
            name: "Message Filtering",
            href: `/dashboard/${guildId}/message-filtering`,
            icon: MessageSquareWarning,
            exact: false,
        },
        {
            name: "Moderation DMs",
            href: `/dashboard/${guildId}/moderation-dm`,
            icon: FileText,
            exact: false,
        },
        {
            name: "Reporting",
            href: `/dashboard/${guildId}/report`,
            icon: Megaphone,
            exact: false,
        },
        {
            name: "Starboard",
            href: `/dashboard/${guildId}/starboard`,
            icon: Star,
            exact: false,
        },
        {
            name: "Leveling",
            href: `/dashboard/${guildId}/leveling`,
            icon: TrendingUp,
            exact: false,
        },
        {
            name: "Custom Commands",
            href: `/dashboard/${guildId}/custom-commands`,
            icon: Terminal,
            exact: false,
        },
        {
            name: "Reaction Roles",
            href: `/dashboard/${guildId}/reaction-roles`,
            icon: FaceSmileIcon,
            exact: false,
        },
        {
            name: "Tickets",
            href: `/dashboard/${guildId}/tickets`,
            icon: Ticket,
            exact: false,
        },
        {
            name: "Logs",
            href: `/dashboard/${guildId}/logs`,
            icon: ScrollTextIcon,
            exact: false,
        },
        {
            name: "Embed Builder",
            href: `/dashboard/${guildId}/embed-builder`,
            icon: LayoutTemplate,
            exact: false,
        },
        {
            name: "Warns",
            href: `/dashboard/${guildId}/warns`,
            icon: AlertTriangle,
            exact: false,
        },
        {
            name: "Temporary Voice Channel",
            href: `/dashboard/${guildId}/temp-voice`,
            icon: Volume2Icon,
            exact: false,
        },
        {
            name: 'Reminders',
            href: `/dashboard/${guildId}/reminders`,
            icon: BellIcon,
            exact: false,
        },
        {
            name: 'Invite Tracking',
            href: `/dashboard/${guildId}/invite-tracking`,
            icon: UserPlus,
            exact: false,
        },
        {
            name: 'Honeypot Channel',
            href: `/dashboard/${guildId}/honeypot`,
            icon: Skull,
            exact: false,
        },
        {
            name: "Member Counter",
            href: `/dashboard/${guildId}/member-counter`,
            icon: User,
            exact: false,
        },
        {
            name: "Giveaway",
            href: `/dashboard/${guildId}/giveaway`,
            icon: PartyPopper,
            exact: false,
        }
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
                        <link.icon className="w-5 h-5" strokeWidth="2"/>
                        {link.name}
                    </Link>
                );
            })}
        </nav>
    );
}