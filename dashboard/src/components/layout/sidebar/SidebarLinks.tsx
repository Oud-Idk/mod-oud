"use client";

import { JSX, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
    AlertTriangle,
    BellIcon,
    Cake,
    ChevronDown, CircleDollarSign,
    Clapperboard,
    DoorOpen,
    FileText,
    LayoutDashboard,
    LayoutTemplate,
    Logs,
    Megaphone,
    MessageSquare,
    MessageSquareWarning,
    Music2,
    PartyPopper,
    Radio,
    ScrollTextIcon,
    Shield,
    ShieldAlert,
    Skull,
    Sparkles,
    Star,
    Terminal,
    Ticket,
    TrendingUp,
    User,
    UserPlus,
    Volume2Icon,
    Wrench
} from "lucide-react";
import { FaceSmileIcon } from "@heroicons/react/24/outline";

interface NavItem {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
    exact?: boolean;
}

interface NavGroup {
    title: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
    items: NavItem[];
}

export function SidebarLinks(): JSX.Element | null {
    const params = useParams();
    const pathname = usePathname();

    if (typeof params.guild_id !== "string") {
        throw new Error("Guild ID is not string!");
    }

    const guildId = params.guild_id;

    // Overview link
    const overviewLink: NavItem = {
        name: "Overview",
        href: `/dashboard/${guildId}`,
        icon: LayoutDashboard,
        exact: true,
    };

    // Categorized and sorted links
    const groups: NavGroup[] = [
        {
            title: "Moderation & Security",
            icon: Shield,
            items: [
                { name: "Honeypot Channel", href: `/dashboard/${guildId}/honeypot`, icon: Skull },
                { name: "Message Filtering", href: `/dashboard/${guildId}/message-filtering`, icon: MessageSquareWarning },
                { name: "Message Logging", href: `/dashboard/${guildId}/message-logging`, icon: Logs },
                { name: "Moderation DMs", href: `/dashboard/${guildId}/moderation-dm`, icon: FileText },
                { name: "Anti-Raid", href: `/dashboard/${guildId}/anti-raid`, icon: ShieldAlert },
                { name: "Reporting", href: `/dashboard/${guildId}/report`, icon: Megaphone },
                { name: "Warns", href: `/dashboard/${guildId}/warns`, icon: AlertTriangle },
            ],
        },
        {
            title: "Engagement & Fun",
            icon: Sparkles,
            items: [
                { name: "Birthdays", href: `/dashboard/${guildId}/birthdays`, icon: Cake },
                { name: "Giveaways", href: `/dashboard/${guildId}/giveaways`, icon: PartyPopper },
                { name: "Leveling", href: `/dashboard/${guildId}/leveling`, icon: TrendingUp },
                { name: "Reaction Roles", href: `/dashboard/${guildId}/reaction-roles`, icon: FaceSmileIcon },
                { name: "Starboard", href: `/dashboard/${guildId}/starboard`, icon: Star },
                { name: "Economy", href: `/dashboard/${guildId}/economy`, icon: CircleDollarSign },
            ],
        },
        {
            title: "Utility & Tools",
            icon: Wrench,
            items: [
                { name: "Custom Commands", href: `/dashboard/${guildId}/custom-commands`, icon: Terminal },
                { name: "Embed Builder", href: `/dashboard/${guildId}/embed-builder`, icon: LayoutTemplate },
                { name: "Invite Tracking", href: `/dashboard/${guildId}/invite-tracking`, icon: UserPlus },
                { name: "Logs", href: `/dashboard/${guildId}/logs`, icon: ScrollTextIcon },
                { name: "Media Only", href: `/dashboard/${guildId}/media-only`, icon: Clapperboard },
                { name: "Member Counter", href: `/dashboard/${guildId}/member-counter`, icon: User },
                { name: "Reminders", href: `/dashboard/${guildId}/reminders`, icon: BellIcon },
                { name: "Temporary Voice Channel", href: `/dashboard/${guildId}/temp-voice`, icon: Volume2Icon },
                { name: "Tickets", href: `/dashboard/${guildId}/tickets`, icon: Ticket },
            ],
        },
        {
            title: "Onboarding",
            icon: MessageSquare,
            items: [
                { name: "Welcome", href: `/dashboard/${guildId}/welcome`, icon: MessageSquare },
                { name: "Leave", href: `/dashboard/${guildId}/leave`, icon: DoorOpen },
            ],
        },
        {
            title: "Media",
            icon: Radio,
            items: [
                { name: "Music", href: `/dashboard/${guildId}/music-stats`, icon: Music2 },
            ],
        },
    ];

    // Track expanded sections (initialize groups containing active route to open)
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        groups.forEach((group) => {
            initial[group.title] = group.items.some((item) => pathname.startsWith(item.href));
        });
        return initial;
    });

    const toggleGroup = (title: string): void => {
        setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
    };

    const isOverviewActive = pathname === overviewLink.href;

    return (
        <nav className="flex flex-col gap-1 p-2">
            {/* Pinned Overview Link */}
            <Link
                href={overviewLink.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                    isOverviewActive
                        ? "bg-surface-active text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                }`}
            >
                <overviewLink.icon className="w-5 h-5 shrink-0" strokeWidth={2} />
                <span className="truncate">{overviewLink.name}</span>
            </Link>

            <div className="my-1.5 h-px bg-border-subtle" />

            {/* Expandable Categories */}
            {groups.map((group) => {
                const isOpen = openGroups[group.title];
                const hasActiveChild = group.items.some((item) => pathname.startsWith(item.href));

                return (
                    <div key={group.title} className="flex flex-col">
                        <button
                            type="button"
                            onClick={() => { toggleGroup(group.title); }}
                            className={`flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors focus-ring ${
                                hasActiveChild
                                    ? "text-brand"
                                    : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <group.icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                                <span>{group.title}</span>
                            </div>
                            <ChevronDown
                                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
                                    isOpen ? "rotate-180" : ""
                                }`}
                            />
                        </button>

                        {/* Collapsible List */}
                        {isOpen && (
                            <div className="flex flex-col gap-0.5 mt-0.5 ml-2 pl-2 border-l border-border-subtle focus-ring">
                                {group.items.map((item) => {
                                    const isActive = pathname.startsWith(item.href);

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors focus-ring ${
                                                isActive
                                                    ? "bg-surface-active text-foreground"
                                                    : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                                            }`}
                                        >
                                            <item.icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                                            <span className="truncate">{item.name}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}