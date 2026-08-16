import React, { ReactNode } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import { TextInput } from "@/components/ui/TextInput";
import { getAvailableCategoryOptions, getAvailableChannelOptions } from "@/features/_shared/dropdown";
import type { TempVoiceHub } from "../../types";

export interface MainConfigTabProps {
    config: TempVoiceHub;
    handleChange: (updated: Partial<TempVoiceHub>) => void;
    channels: Record<string, string>;
    categories: Record<string, string>;
}

export const MainConfigTab = ({
    config,
    handleChange,
    channels,
    categories,
}: MainConfigTabProps): ReactNode => {
    return (
        <div className="space-y-4 max-w-lg">
            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-foreground">
                    Hub Configuration Name
                </label>
                <TextInput
                    value={config.name}
                    onChange={(e) => { handleChange({ name: e.target.value }); }}
                    placeholder="e.g. General Voice Hub"
                />
            </div>

            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-foreground">
                    Hub Trigger Channel
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                    When users join this voice channel, the bot will clone it and create their room.
                </p>
                <Dropdown
                    value={config.hub_channel_id ?? ""}
                    onChange={(id) => { handleChange({ hub_channel_id: id }); }}
                    options={getAvailableChannelOptions(channels)}
                    placeholder="Select a voice channel..."
                />
            </div>

            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-foreground">
                    Target Parent Category
                </label>
                <p className="text-xs text-muted-foreground mb-2">The category where new channels are created.</p>
                <Dropdown
                    value={config.category_id ?? ""}
                    onChange={(id) => { handleChange({ category_id: id }); }}
                    options={getAvailableCategoryOptions(categories)}
                    placeholder="Select a category..."
                />
            </div>

            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-foreground">
                    Default User Limit (Optional)
                </label>
                <NumberInput
                    value={config.user_limit ?? undefined}
                    onChange={(val) => { handleChange({ user_limit: val }); }}
                    placeholder="None"
                />
            </div>

            <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-foreground">
                    Default Channel Name
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                    The default name for a newly created temporary channel.
                </p>
                <TextInput
                    value={config.default_channel_name}
                    onChange={(e) => { handleChange({ default_channel_name: e.target.value }); }}
                />
            </div>
        </div>
    );
};