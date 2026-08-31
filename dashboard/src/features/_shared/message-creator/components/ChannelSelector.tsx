"use client";

import React, { JSX, useMemo } from "react";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { InputLabel } from "@/components/layout/InputLabel";
import { DiscordChannel } from "@/features/_shared/channels.types";

interface ChannelSelectorProps {
    channels: DiscordChannel[];
    value: string | null;
    onChange: (value: string | null) => void;
    disabled?: boolean;
    error?: boolean;
}

export function ChannelSelector({
    channels,
    value,
    onChange,
    disabled,
    error,
}: ChannelSelectorProps): JSX.Element {
    const options = useMemo(() => {
        return channels.map((channel) => ({
            value: channel.id,
            label: `#${channel.name}${channel.type === 5 ? " 📢" : ""}`,
        }));
    }, [channels]);

    return (
        <div className="flex flex-col max-w-md">
            <InputLabel required>Target Channel</InputLabel>
            <Dropdown
                options={options}
                value={value}
                onChange={onChange}
                disabled={disabled}
                placeholder="Select a channel..."
                error={error}
            />
            {error && (
                <span className="text-xs text-danger mt-1">
                    Please select a channel to post the panel.
                </span>
            )}
        </div>
    );
}