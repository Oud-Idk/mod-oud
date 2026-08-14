"use client";

import React, { ReactNode, useState, useCallback, JSX } from "react";
import { useRouter } from "next/navigation";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";

import { ReactionRoleCreateModal } from "./ReactionRoleCreateModal";
import { ReactionRoleConfig } from "./ReactionRoleConfig";
import type { ReactionMessage, SaveReactionMessageInput } from "../types";
import { saveReactionMessageInputSchema } from "../types";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { DEFAULT_MESSAGE_LAYOUT } from "@/features/_shared/embed";
import { Button } from "@/components/ui/Button";

interface ReactionRolesBodyProps {
    guildId: string;
    reactionRoles: ReactionMessage[];
    activeConfig: ReactionMessage | null;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    onSave: (config: SaveReactionMessageInput) => Promise<ReactionMessage>;
    onDelete: (id: number) => Promise<boolean>;
    onSend: (id: number) => Promise<{ message_id: string }>;
    onDeleteDiscordMessage: (id: number) => Promise<{ success: boolean }>;
}

export function ReactionRolesBody({
    guildId,
    reactionRoles,
    activeConfig,
    channelMap,
    roleMap,
    onSave,
    onDelete,
    onSend,
    onDeleteDiscordMessage,
}: ReactionRolesBodyProps): JSX.Element {
    const router = useRouter();

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave: originalHandleSave,
        handleCancel,
    } = useConfigForm<ReactionMessage | null>({
        initialConfig: activeConfig,
        onSave: async (updatedConfig) => {
            if (updatedConfig !== null) await onSave(updatedConfig);
        },
    });

    const handleSave = useCallback((): void => {
        if (config === null) return;
        const result = saveReactionMessageInputSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0]?.message ?? "Invalid configuration");
            return;
        }
        void originalHandleSave();
    }, [config, originalHandleSave]);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <div>
            <ConfigListLayout<ReactionMessage>
                title="Reaction Roles"
                onCreateClick={() => { setIsCreateModalOpen(true); }}
                items={reactionRoles}
                renderItem={(item: ReactionMessage): ReactNode => {
                    const isCurrent = activeConfig?.id === item.id;
                    const isSent = item.message_id !== null && item.message_id !== undefined && item.message_id.trim().length > 0;
                    const statusText = isSent ? "Sent" : "Draft";

                    const mappingCount = item.mode === "BUTTON" ? item.buttons.length : item.reactions.length;
                    const mappingLabel = item.mode === "BUTTON"
                        ? (mappingCount === 1 ? "1 Button" : `${String(mappingCount)} Buttons`)
                        : (mappingCount === 1 ? "1 Reaction" : `${String(mappingCount)} Reactions`);

                    return (
                        <button
                            key={item.id}
                            onClick={() => { router.push(`/dashboard/${guildId}/reaction-roles?id=${String(item.id)}`); }}
                            className={cn(
                                "w-full flex flex-col text-left p-3 rounded-md transition-all cursor-pointer border",
                                isCurrent
                                    ? "bg-surface-active/50 border-border text-foreground shadow-sm"
                                    : "border-transparent hover:bg-surface-active/60 text-foreground"
                            )}
                        >
                            <div className="flex justify-between items-center gap-2 w-full">
                                <span className="truncate font-semibold text-sm">{item.name}</span>
                                <span
                                    className={cn(
                                        "text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                                        isSent ? "text-success" : "text-muted-foreground"
                                    )}
                                >
                                    {statusText}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-1 w-full">
                                {mappingLabel} • {item.mode === "BUTTON" ? "Button Mode" : "Reaction Mode"}
                            </div>
                        </button>
                    );
                }}
                hasActiveConfig={config !== null}
                handleSave={handleSave}
                handleCancel={handleCancel}
                noActivePlaceholder={
                    <div className="max-w-md mx-auto space-y-4 flex items-center flex-col">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">
                                Reaction Roles
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Create messages that grants roles upon a user when they click on a reaction or an interaction button.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                onClick={() => { setIsCreateModalOpen(true); }}
                            >
                                Create Your First Reaction Role
                            </Button>
                        </div>
                    </div>
                }
            >
                {config !== null && (
                    <ReactionRoleConfig
                        key={config.id}
                        config={config}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        isPending={isPending}
                        isDirty={isDirty}
                        onDelete={onDelete}
                        onSend={onSend}
                        guildId={guildId}
                        onChange={setConfig}
                        onDeleteDiscordMessage={onDeleteDiscordMessage}
                    />
                )}
            </ConfigListLayout>

            <ReactionRoleCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); }}
                channelMap={channelMap}
                onSave={async (v) => {
                    return await onSave({
                        channel_id: v.channel_id !== undefined && v.channel_id !== null && v.channel_id.length > 0 ? v.channel_id : null,
                        guild_id: guildId,
                        name: v.name ?? "",
                        mode: v.mode ?? "REACTION",
                        message: DEFAULT_MESSAGE_LAYOUT,
                    });
                }}
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}