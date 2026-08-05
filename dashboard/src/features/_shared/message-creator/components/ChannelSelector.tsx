"use client";

import React, { useMemo } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { InputLabel } from "@/components/layout/InputLabel";
import { DiscordChannel } from "@/features/_shared/channels.types";

interface ChannelSelectorProps {
    channels: DiscordChannel[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    targetChannelIsEmpty?: boolean; // 👈 Added prop
}

export function ChannelSelector({
    channels,
    value,
    onChange,
    disabled,
    className,
    targetChannelIsEmpty,
}: ChannelSelectorProps) {
    const options = useMemo(() => {
        const list = channels.map((channel) => ({
            value: channel.id,
            label: `#${channel.name}${channel.type === 5 ? " 📢" : ""}`,
        }));

        return [{ value: "", label: "Select a channel..." }, ...list];
    }, [channels]);

    return (
        <div className="flex flex-col max-w-sm">
            <InputLabel required>Target Channel</InputLabel>
            <Dropdown
                options={options}
                value={value}
                onChange={onChange}
                disabled={disabled}
                placeholder="Select a channel..."
                className={className}
                error={targetChannelIsEmpty}
            />
            {targetChannelIsEmpty && (
                <span className="text-xs text-danger mt-1 font-medium">
                    A target channel is required when this feature is enabled.
                </span>
            )}
        </div>
    );
}