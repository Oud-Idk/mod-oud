"use client";

import React, { useState, useEffect, useTransition, JSX } from "react";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { useRouter } from "next/navigation";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { CustomCommandConfig } from "@/features/custom-commands/components/CustomCommandConfig";
import { CustomCommandCreateModal } from "@/features/custom-commands/components/CustomCommandCreateModal";
import { CustomCommand, SaveCustomCommandData, SaveCustomCommandSchema } from "@/features/custom-commands/types";
import { Button } from "@/components/ui/Button";
import { isDeepEqual } from "@/features/_shared/embed";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

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
}: CustomCommandsBodyProps): JSX.Element {
    const router = useRouter();
    const [config, setConfig] = useState<CustomCommand | null>(activeConfig);
    const [isPending, startTransition] = useTransition();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    useEffect(() => {
        setConfig(activeConfig);
    }, [activeConfig]);

    const isDirty = !isDeepEqual(config, activeConfig);

    const handleSave = (): void => {
        if (!config) return;

        const result = SaveCustomCommandSchema.safeParse(config);
        if (!result.success) {
            const firstMessage = result.error.issues[0]?.message || "Invalid custom command configuration.";
            toast.error(firstMessage);
            return;
        }

        startTransition(async () => {
            try {
                await onSave(config);
                toast.success("Custom command saved successfully");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to save custom command.");
            }
        });
    };

    const handleCancel = (): void => {
        setConfig(activeConfig);
    };

    return (
        <div>
            <ConfigListLayout<CustomCommand>
                title="Custom Commands"
                onCreateClick={() => setIsCreateModalOpen(true)}
                items={commands}
                renderItem={(item) => {
                    const isCurrent = activeConfig?.id === item.id;
                    const statusText = item.enabled ? "Active" : "Disabled";
                    const actionCount = item.actions.length;

                    return (
                        <button
                            key={item.id}
                            onClick={() => router.push(`/dashboard/${guildId}/custom-commands?id=${item.id}`)}
                            className={cn(
                                "w-full flex flex-col text-left p-3 rounded-md transition-all cursor-pointer border focus-ring",
                                isCurrent
                                    ? "bg-surface-active/50 border-border text-foreground shadow-sm"
                                    : "border-transparent hover:bg-surface-active/60 text-foreground"
                            )}
                        >
                            <div className="flex justify-between items-center gap-2 w-full">
                                <span className="truncate font-semibold text-sm">!{item.name}</span>
                                <span
                                    className={cn(
                                        "text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                                        item.enabled ? "text-success" : "text-muted-foreground"
                                    )}
                                >
                                    {statusText}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-1 w-full">
                                {actionCount === 1 ? "1 Action" : `${actionCount} Actions`}
                                {item.description ? ` • ${item.description}` : ""}
                            </div>
                        </button>
                    );
                }}
                hasActiveConfig={!!config}
                handleSave={handleSave}
                handleCancel={handleCancel}
                noActivePlaceholder={
                    <div className="max-w-md mx-auto space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">No Command Selected</h3>
                            <p className="text-sm text-muted-foreground">
                                Select an existing custom command from the sidebar to edit its triggers and actions, or create a new one to begin.
                            </p>
                        </div>
                        <Button onClick={() => setIsCreateModalOpen(true)}>
                            Create Your First Command
                        </Button>
                    </div>
                }
            >
                {config && (
                    <CustomCommandConfig
                        key={config.id}
                        config={config}
                        isPending={isPending}
                        guildId={guildId}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        onDelete={onDelete}
                        onChange={setConfig}
                    />
                )}
            </ConfigListLayout>

            <CustomCommandCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={async (v) => {
                    const newCmd = await onSave({
                        guild_id: guildId,
                        name: v.name.replace(/^!/, ""),
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
                                    message_layout: {
                                        messages: [
                                            {
                                                format: "TEXT",
                                                content: "Hello from my custom command!",
                                                embed: {},
                                            },
                                        ],
                                        randomize: false,
                                    },
                                },
                            },
                        ],
                    });
                    setIsCreateModalOpen(false);
                    router.push(`/dashboard/${guildId}/custom-commands?id=${newCmd.id}`);
                }}
            />

            {isDirty && <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending} />}
        </div>
    );
}