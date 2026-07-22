import React from "react";
import { TextInput } from "@/components/Inputs/TextInput";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { NumberInput } from "@/components/Inputs/NumberInput";

import { TempVoiceHub } from "@/types/db";

export interface MainConfigTabProps {
    config: TempVoiceHub;
    handleChange: (updated: Partial<TempVoiceHub> | TempVoiceHub) => void;
    channels: Record<string, string>;
    categories: Record<string, string>;
}

export const MainConfigTab: React.FC<MainConfigTabProps> = ({
    config,
    handleChange,
    channels,
    categories,
}) => {
    return <div className="space-y-4 max-w-lg">
        <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2">
                Hub Configuration Name
            </label>
            <TextInput
                value={config.name || ""}
                onChange={(e) => handleChange({ name: e.target.value })}
                disableSubmitButton
                className="max-w-none"
            />
        </div>

        <div>
            <label className="block text-xs font-semibold uppercase tracking-wider">
                Hub Trigger Channel
            </label>
            <p className="text-xs mb-2">
                When users join this voice channel, the bot will clone it and create their room. </p>
            <Dropdown
                value={config.hub_channel_id || ""} onChange={(id) => handleChange({ hub_channel_id: id })} options={[
                { value: "", label: "Select a channel..." },
                ...Object.entries(channels).map(([id, name]) => ({
                    value: id,
                    label: `${name}`,
                })),
            ]}
            />
        </div>

        <div>
            <label className="block text-xs font-semibold uppercase tracking-wider">
                Target Parent Category
            </label>
            <p className="text-xs mb-2">
                The category where new channels are created. </p>
            <Dropdown
                value={config.category_id || ""} onChange={(id) => handleChange({ category_id: id })} options={[
                { value: "", label: "Select a category..." },
                ...Object.entries(categories).map(([id, name]) => ({
                    value: id,
                    label: `${name}`,
                })),
            ]}
            />
        </div>

        <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2">
                Default User Limit (Optional)
            </label>
            <NumberInput
                value={config.user_limit}
                onChange={(e) => handleChange({ user_limit: typeof e === "string" ? Number.isNaN(parseInt(e)) ? 0 : parseInt(e) : e })}
                placeholder="None"
                className="max-w-none"
            />
        </div>

        <div>
            <label className="block text-xs font-semibold uppercase tracking-wider">Default Name</label>
            <p className="text-xs mb-2">
                The default name for a newly created temporary channel. </p>
            <TextInput
                disableSubmitButton
                value={config.default_channel_name}
                onChange={(e) => handleChange({ name: e.target.value })}
                className="max-w-none mb-2"
            />
        </div>
    </div>;
}