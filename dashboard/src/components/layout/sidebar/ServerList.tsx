"use client";

import { useParams, useRouter } from "next/navigation";
import { JSX, useMemo } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { DiscordGuild } from "@/features/_shared/guild";

interface ServerListProps {
    guilds: DiscordGuild[];
}

export function ServerList({ guilds }: ServerListProps): JSX.Element {
    const params = useParams();
    const router = useRouter();

    if (typeof params?.guild_id !== "string") {
        throw new Error("Guild ID is not string!");
    }

    const currentGuildId = params?.guild_id;
    const selected = guilds.find((g) => g.id === currentGuildId) || guilds[0] || null;

    const options = useMemo(() => {
        return guilds.map((g) => ({
            value: g.id,
            label: g.name
        }));
    }, [guilds]);

    if (guilds.length === 0) {
        return (
            <p className="text-sm text-neutral-500 pl-2">No mutual servers found</p>
        );
    }

    const handleSelect = (id: string | null): void => {
        if (id && id !== currentGuildId) {
            router.push(`/dashboard/${id}`);
        }
    };

    return (
        <div className="w-full px-2">
            <Dropdown
                options={options} value={selected?.id || ""} onChange={handleSelect} placeholder="Select a server"
            />
        </div>
    );
}