"use client";

import React, { useMemo } from "react";
import { DiscordChannel } from "@/types";
import { Dropdown } from "@/components/Dropdown"; // Adjust the import path as necessary

interface ChannelSelectorProps {
    channels: DiscordChannel[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export function ChannelSelector({
    channels,
    value,
    onChange,
    disabled
}: ChannelSelectorProps) {
    const options = useMemo(() => {
        const list = channels.map((channel) => ({
            value: channel.id,
            label: `#${channel.name}${channel.type === 5 ? " 📢" : ""}`,
        }));

        // Include the default placeholder item at the top of the list
        return [{ value: "", label: "Select a channel..." }, ...list];
    }, [channels]);

    return (
        <div className="flex flex-col gap-2 mb-6 max-w-sm">
            <label className="text-sm font-semibold block">
                Target Channel
            </label>
            <Dropdown
                options={options}
                value={value}
                onChange={onChange}
                disabled={disabled}
                placeholder="Select a channel..."
            />
        </div>
    );
}