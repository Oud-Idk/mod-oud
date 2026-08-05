"use client";

import React, { ReactNode, useState } from "react";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { useRouter } from "next/navigation";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { CustomCommandConfig } from "@/features/custom-commands/components/CustomCommandConfig";
import { CustomCommandCreateModal } from "@/features/custom-commands/components/CustomCommandCreateModal";
import { CustomCommand, SaveCustomCommandData } from "@/features/custom-commands/types";

interface CustomCommandsBodyProps {
    commands: CustomCommand[];
    activeConfig: CustomCommand | null;
    onSave: (config: SaveCustomCommandData) => Promise<CustomCommand>;
    onDelete: (id: number) => Promise<boolean>;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    guildId: string;
}

export function CustomCommandsBody({
    commands,
    activeConfig,
    onSave,
    onDelete,
    channelMap,
    roleMap,
    guildId
}: CustomCommandsBodyProps): ReactNode {
    const router = useRouter();

    const { config, isPending, isDirty, setIsEmpty, handleSave, handleCancel, handleChange } =
        useConfigForm<CustomCommand | null>({
            initialConfig: activeConfig,
            onSave: async (updatedConfig) => {
                if (updatedConfig) {
                    await onSave(updatedConfig);
                }
            },
        });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <div>
            <ConfigListLayout<CustomCommand> title="Custom Commands"
                onCreateClick={() => setIsCreateModalOpen(true)}
                items={commands}
                renderItem={(item) => {
                    const isCurrent = activeConfig?.id === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => router.push(`/dashboard/${guildId}/custom-commands?id=${item.id}`)}
                            className={`w-full text-left px-3 py-2 rounded text-sm transition block cursor-pointer truncate ${
                                isCurrent ? "bg-neutral-400/15 font-medium" : "hover:bg-neutral-300/15"
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-semibold truncate">!{item.name}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.enabled ? "bg-green-500/20 text-green-400" : "bg-neutral-700 text-neutral-400"}`}>
                                    {item.enabled ? "Active" : "Disabled"}
                                </span>
                            </div>
                        </button>
                    );
                }}
                hasActiveConfig={!!config}
                handleSave={handleSave}
                handleCancel={handleCancel}
                noActivePlaceholder={
                    <>
                        <p className="text-sm">Select a custom command or create a new one to begin.</p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="text-xs px-3.5 py-1.5 bg-zinc-850 rounded border border-neutral-500 hover:bg-neutral-300/10 cursor-pointer"
                        >
                            Create Your First Command
                        </button>
                    </>
                }
            >
                {config && (
                    <CustomCommandConfig
                        key={config.id}
                        config={config}
                        isPending={isPending}
                        isDirty={isDirty}
                        guildId={guildId}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        onDelete={onDelete}
                        onChange={handleChange}
                        setIsEmpty={setIsEmpty}
                    />
                )}
            </ConfigListLayout>

            <CustomCommandCreateModal
                isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSave={async (v) => {
                const newCmd = await onSave({
                    guild_id: guildId,
                    name: v.name.replace(/^!/, ""), // Strip leading ! if typed
                    description: v.description || "",
                    enabled: true,
                    delete_trigger: false,
                    cooldown_type: "NONE",
                    cooldown_seconds: 0,
                    allowed_roles: [],
                    ignored_roles: [],
                    allowed_channels: [],
                    ignored_channels: [],
                    actions: [
                        {
                            type: "respond_current_channel",
                            data: {
                                is_dm: false,
                                is_ephemeral: false,
                                messages: [{ format: "TEXT", content: "Hello from my custom command!" }],
                                randomize: false,
                            },
                        },
                    ],
                });
                setIsCreateModalOpen(false);
                router.push(`/dashboard/${guildId}/custom-commands?id=${newCmd.id}`);
            }}
            />

            {isDirty && <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}/>}
        </div>
    );
}