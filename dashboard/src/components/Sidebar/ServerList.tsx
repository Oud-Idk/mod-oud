"use client";

import { DiscordGuild } from "@/types";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { Dropdown } from "@/components/Inputs/Dropdown";

interface ServerListProps {
    guilds: DiscordGuild[];
}

export function ServerList({ guilds }: ServerListProps) {
    const params = useParams();
    const router = useRouter();

    const currentGuildId = params?.guild_id as string | undefined;
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

    const handleSelect = (id: string) => {
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