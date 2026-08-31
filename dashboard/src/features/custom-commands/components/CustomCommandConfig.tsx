"use client";

import React, { JSX, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/ui/inputs/TextInput";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";

import type { CommandAction, CustomCommand } from "../types";
import { CUSTOM_COMMAND_TEMPLATE_CONFIG } from "@/features/custom-commands/builderConfigs";
import { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import Emphasis from "@/components/layout/Emphasis";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { Button } from "@/components/ui/inputs/Button";
import { InputLabel } from "@/components/layout/InputLabel";
import { MessageLayout } from "@/features/_shared/embed";

interface CustomCommandConfigProps {
    config: CustomCommand;
    isPending: boolean;
    guildId: string;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    onDelete: (id: number) => Promise<boolean>;
    onChange: (updated: CustomCommand) => void;
}

type TabValue = "GENERAL" | "RESPONSE";

const CUSTOM_COMMANDS_VALUE: TabItem<TabValue>[] = [
    { value: "GENERAL", label: "General" },
    { value: "RESPONSE", label: "Response" },
];

export function CustomCommandConfig({
    config,
    isPending,
    guildId,
    onDelete,
    onChange,
}: CustomCommandConfigProps): JSX.Element {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [activeTab, setActiveTab] = useState<TabValue>("GENERAL");

    const handleDelete = (id: number): void => {
        setIsDeleting(true);
        void onDelete(id)
            .then(() => { router.push(`/dashboard/${guildId}/custom-commands`); })
            .catch(() => {
                alert("Failed to delete command.");
                setIsDeleting(false);
            });
    };

    const defaultPayload: MessageLayout = {
        format: "TEXT",
        content: "",
        embed: {},
    };

    const fallbackAction: CommandAction = {
        type: "respond_current_channel",
        data: {
            is_dm: false,
            is_ephemeral: false,
            message_layout: { messages: [defaultPayload], randomize: false },
        },
    };

    // Extract primary action safely
    const primaryAction: CommandAction =
        config.actions.length > 0 ? config.actions[0] : fallbackAction;

    // Correct nested property extraction
    const primaryMessagePayload: MessageLayout =
        primaryAction.type === "respond_current_channel" || primaryAction.type === "send_channel_message"
            ? primaryAction.data.message_layout.messages.length > 0
                ? primaryAction.data.message_layout.messages[0]
                : defaultPayload
            : defaultPayload;

    const handleMessageChange = (updatedMsg: GenericMessageConfig): void => {
        const updatedLayout: MessageLayout = {
            format: updatedMsg.format,
            content: updatedMsg.content ?? "",
            embed: updatedMsg.embed ?? {},
        };

        const updatedActions: CommandAction[] = [
            {
                type: "respond_current_channel",
                data: {
                    is_dm: false,
                    is_ephemeral: false,
                    message_layout: {
                        messages: [updatedLayout],
                        randomize: false,
                    },
                },
            },
        ];

        onChange({ ...config, actions: updatedActions });
    };

    return (
        <div>
            <Tabs tabs={CUSTOM_COMMANDS_VALUE} activeTab={activeTab} onChange={setActiveTab} />
            {activeTab === "GENERAL" && (
                <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                            <Emphasis>!{config.name}</Emphasis>
                            <ToggleSwitch
                                checked={config.enabled}
                                onChange={(checked) => { onChange({ ...config, enabled: checked }); }}
                                text={config.enabled ? "Enabled" : "Disabled"}
                                className="mb-0"
                            />
                        </div>
                        <Button
                            disabled={isPending || isDeleting}
                            onClick={() => { handleDelete(config.id); }}
                            variant="danger"
                        >
                            {isDeleting ? "Deleting..." : "Delete Command"}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <InputLabel required>Command Name / Trigger</InputLabel>
                            <TextInput
                                placeholder="rules"
                                value={config.name}
                                onChange={(e) => { onChange({ ...config, name: e.target.value.replace(/\s+/g, "") }); }}
                            />
                        </div>

                        <div className="space-y-2">
                            <InputLabel>Description</InputLabel>
                            <TextInput
                                placeholder="Displays server rules"
                                value={config.description ?? ""}
                                onChange={(e) => { onChange({ ...config, description: e.target.value }); }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <InputLabel>Cooldown Type</InputLabel>
                            <Dropdown
                                options={[
                                    { value: "NONE", label: "No Cooldown" },
                                    { value: "USER", label: "Per User" },
                                    { value: "SERVER", label: "Server-wide" },
                                ]}
                                value={config.cooldown_type}
                                onChange={(val) => {
                                    if (val === "NONE" || val === "USER" || val === "SERVER") {
                                        onChange({ ...config, cooldown_type: val });
                                    }
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <InputLabel>Cooldown Duration (Seconds)</InputLabel>
                            <NumberInput
                                placeholder="0"
                                value={config.cooldown_seconds}
                                onChange={(val) => { onChange({ ...config, cooldown_seconds: val ?? 0 }); }}
                            />
                        </div>
                    </div>

                    <ToggleSwitch
                        checked={config.delete_trigger}
                        onChange={(checked) => { onChange({ ...config, delete_trigger: checked }); }}
                        text="Delete user trigger message after command execution"
                    />
                </div>
            )}

            {activeTab === "RESPONSE" && (
                <div className="pt-2">
                    <MessageConfigEditor
                        config={{
                            format: primaryMessagePayload.format,
                            content: primaryMessagePayload.content,
                            embed: primaryMessagePayload.embed,
                        }}
                        onChange={handleMessageChange}
                        onEmbedChange={(embed) => {
                            handleMessageChange({
                                format: primaryMessagePayload.format,
                                content: primaryMessagePayload.content,
                                embed,
                            });
                        }}
                        embedTemplateConfig={CUSTOM_COMMAND_TEMPLATE_CONFIG}
                        enableToggle={false}
                        noChannels={true}
                    />
                </div>
            )}
        </div>
    );
}