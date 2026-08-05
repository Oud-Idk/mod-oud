import React, { ReactNode } from "react";
import { TextInput } from "@/components/ui/TextInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import { TempVoiceHub } from "@/features/temp-voice/types";

export interface MainConfigTabProps {
    config: TempVoiceHub;
    handleChange: (updated: Partial<TempVoiceHub> | TempVoiceHub) => void;
    channels: Record<string, string>;
    categories: Record<string, string>;
}

export const MainConfigTab = ({
    config,
    handleChange,
    channels,
    categories,
}: MainConfigTabProps): ReactNode => {
    const isNameMissing = !config.name?.trim();
    const isHubChannelMissing = !config.hub_channel_id;
    const isCategoryMissing = !config.category_id;

    return (
        <div className="space-y-4 max-w-lg">
            {/* Hub Configuration Name */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2">
                    Hub Configuration Name
                </label>
                <TextInput
                    value={config.name || ""}
                    onChange={(e) => handleChange({ name: e.target.value })}
                    className={`max-w-none ${isNameMissing ? "border-red-700 dark:border-red-300" : ""}`}
                />
            </div>

            {/* Hub Trigger Channel */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider">
                    Hub Trigger Channel
                </label>
                <p className="text-xs mb-2">
                    When users join this voice channel, the bot will clone it and create their room.
                </p>
                <Dropdown
                    value={config.hub_channel_id || ""}
                    onChange={(id) => handleChange({ hub_channel_id: id })}
                    options={[
                        { value: "", label: "Select a channel..." },
                        ...Object.entries(channels).map(([id, name]) => ({
                            value: id,
                            label: `${name}`,
                        })),
                    ]}
                    className={isHubChannelMissing ? "border-red-700 dark:border-red-300" : ""}
                />
            </div>

            {/* Target Parent Category */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider">
                    Target Parent Category
                </label>
                <p className="text-xs mb-2">The category where new channels are created.</p>
                <Dropdown
                    value={config.category_id || ""}
                    onChange={(id) => handleChange({ category_id: id })}
                    options={[
                        { value: "", label: "Select a category..." },
                        ...Object.entries(categories).map(([id, name]) => ({
                            value: id,
                            label: `${name}`,
                        })),
                    ]}
                    className={isCategoryMissing ? "border-red-700 dark:border-red-300" : ""}
                />
            </div>

            {/* Default User Limit */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2">
                    Default User Limit (Optional)
                </label>
                <NumberInput
                    value={config.user_limit ?? undefined}
                    onChange={(val) => handleChange({ user_limit: val })}
                    placeholder="None"
                    className="max-w-none"
                />
            </div>

            {/* Default Channel Name */}
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider">
                    Default Name
                </label>
                <p className="text-xs mb-2">
                    The default name for a newly created temporary channel.
                </p>
                <TextInput
                    value={config.default_channel_name || ""}
                    onChange={(e) => handleChange({ default_channel_name: e.target.value })}
                    className="max-w-none mb-2"
                />
            </div>
        </div>
    );
};