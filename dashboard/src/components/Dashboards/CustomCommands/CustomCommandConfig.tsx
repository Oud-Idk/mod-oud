"use client";

import React, { SetStateAction, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/Inputs/TextInput";
import { NumberInput } from "@/components/Inputs/NumberInput";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { CUSTOM_COMMAND_TEMPLATE_CONFIG } from "@/utils/embedTemplates";
import { CustomCommand, CommandAction, CustomMessagePayload } from "@/types/db/customCommand";
import { Format } from "@/types/db";
import { DiscordEmbed } from "@/types/embed";

interface CustomCommandConfigProps {
    config: CustomCommand;
    isPending: boolean;
    isDirty: boolean;
    guildId: string;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    onDelete: (id: number) => Promise<boolean>;
    onChange: (updated: CustomCommand) => void;
    setIsEmpty: (isEmpty: SetStateAction<boolean>) => void;
}

export function CustomCommandConfig({
    config,
    isPending,
    guildId,
    onDelete,
    onChange,
    setIsEmpty,
}: CustomCommandConfigProps) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = (id: number) => {
        setIsDeleting(true);
        onDelete(id)
            .then(() => router.push(`/dashboard/${guildId}/custom-commands`))
            .catch(() => {
                alert("Failed to delete command.");
                setIsDeleting(false);
            });
    };

    // Strongly typed fallback payload
    const defaultPayload: CustomMessagePayload = {
        format: "TEXT" as Format,
        content: "",
        embed: {},
    };

    const primaryAction = config.actions?.[0] || {
        type: "respond_current_channel",
        data: { is_dm: false, is_ephemeral: false, messages: [defaultPayload], randomize: false },
    };

    const primaryMessagePayload: CustomMessagePayload =
        primaryAction.type === "respond_current_channel" || primaryAction.type === "send_channel_message"
            ? primaryAction.data.messages[0] || defaultPayload
            : defaultPayload;

    const handleMessageChange = (updatedMsg: { format: Format; content?: string; embed?: DiscordEmbed }) => {
        const updatedActions: CommandAction[] = [
            {
                type: "respond_current_channel",
                data: {
                    is_dm: false,
                    is_ephemeral: false,
                    messages: [
                        {
                            format: updatedMsg.format,
                            content: updatedMsg.content ?? "",
                            embed: updatedMsg.embed ?? {},
                        },
                    ],
                    randomize: false,
                },
            },
        ];
        onChange({ ...config, actions: updatedActions });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                    <p className="font-semibold text-lg">!{config.name}</p>
                    <ToggleSwitch
                        checked={config.enabled}
                        onChange={(checked) => onChange({ ...config, enabled: checked })}
                        text={config.enabled ? "Enabled" : "Disabled"}
                    />
                </div>
                <button
                    type="button"
                    disabled={isPending || isDeleting}
                    onClick={() => handleDelete(config.id)}
                    className="px-4 py-2 text-sm cursor-pointer border-red-500/80 border hover:bg-red-300/10 rounded transition disabled:opacity-50"
                >
                    {isDeleting ? "Deleting..." : "Delete Command"}
                </button>
            </div>

            {/* Core Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Command Name / Trigger</label>
                    <TextInput
                        disableSubmitButton
                        placeholder="rules"
                        value={config.name || ""}
                        onChange={(e) => onChange({ ...config, name: e.target.value.replace(/\s+/g, "") })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium">Description</label>
                    <TextInput
                        disableSubmitButton
                        placeholder="Displays server rules"
                        value={config.description || ""}
                        onChange={(e) => onChange({ ...config, description: e.target.value })}
                    />
                </div>
            </div>

            {/* Cooldown Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-800">
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Cooldown Type</label>
                    <Dropdown
                        options={[
                            { value: "NONE", label: "No Cooldown" },
                            { value: "USER", label: "Per User" },
                            { value: "SERVER", label: "Server-wide" },
                        ]}
                        value={config.cooldown_type || "NONE"}
                        onChange={(val) => onChange({ ...config, cooldown_type: val as any })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium">Cooldown Duration (Seconds)</label>
                    <NumberInput
                        placeholder="0"
                        value={config.cooldown_seconds || 0}
                        onChange={(val) => onChange({ ...config, cooldown_seconds: val || 0 })}
                    />
                </div>
            </div>

            {/* Behavior Options */}
            <div className="pt-2">
                <ToggleSwitch
                    checked={config.delete_trigger}
                    onChange={(checked) => onChange({ ...config, delete_trigger: checked })}
                    text="Delete user trigger message after command execution"
                />
            </div>

            {/* Response Message Editor */}
            <div className="pt-4 border-t border-neutral-800">
                <label className="block text-sm font-medium mb-3">Command Response Message</label>
                <MessageConfigEditor
                    config={{
                        format: primaryMessagePayload.format,
                        content: primaryMessagePayload.content,
                        embed: primaryMessagePayload.embed,
                    }}
                    onChange={handleMessageChange}
                    onEmbedChange={(embed) => handleMessageChange({ ...primaryMessagePayload, embed })}
                    embedTemplateConfig={CUSTOM_COMMAND_TEMPLATE_CONFIG}
                    setIsEmpty={setIsEmpty}
                    enableToggle={false}
                    noChannels={true}
                />
            </div>
        </div>
    );
}