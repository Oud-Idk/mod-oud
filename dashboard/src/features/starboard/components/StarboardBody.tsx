"use client";

import React, { useState, useCallback, JSX } from "react";
import { useRouter } from "next/navigation";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

import { StarboardCreateModal } from "./StarboardCreateModal";
import { StarboardConfigEditor } from "./StarboardConfigEditor";
import type { StarboardConfig, StarboardConfigInput } from "../types";
import { starboardConfigInputSchema } from "../types";
import { toast } from "sonner";

interface StarboardBodyProps {
    guildId: string;
    starboardConfigs: StarboardConfig[];
    activeConfig: StarboardConfig | null;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    onSave: (config: StarboardConfigInput) => Promise<string>;
    onDelete: (id: string) => Promise<void>;
}

export function StarboardBody({
    guildId,
    starboardConfigs,
    activeConfig,
    channelMap,
    roleMap,
    onSave,
    onDelete,
}: StarboardBodyProps): JSX.Element {
    const router = useRouter();
    const [isEmpty, setIsEmpty] = useState(false);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave: originalHandleSave,
        handleCancel,
    } = useConfigForm<StarboardConfigInput | null>({
        initialConfig: activeConfig,
        onSave: async (updatedConfig) => {
            if (updatedConfig) {
                const savedId = await onSave(updatedConfig);
                router.push(`/dashboard/${guildId}/starboard?id=${savedId}`);
            }
        },
    });

    const handleSave = useCallback(() => {
        if (!config) return;
        const result = starboardConfigInputSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0].message);
            return;
        }
        originalHandleSave();
    }, [config, originalHandleSave]);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <>
            <ConfigListLayout<StarboardConfig>
                title="Boards"
                onCreateClick={() => { setIsCreateModalOpen(true); }}
                items={starboardConfigs}
                emptyMessage="No starboards configured yet."
                hasActiveConfig={!!config}
                handleSave={() => { handleSave(); }}
                handleCancel={handleCancel}
                renderItem={(board) => {
                    const isCurrent = activeConfig?.id === board.id;
                    const channelName = board.starboard_channel_id !== null ? (channelMap[board.starboard_channel_id] ?? "unknown-channel") : "Unassigned Channel";

                    return (
                        <button
                            key={board.id}
                            onClick={() => { router.push(`/dashboard/${guildId}/starboard?id=${board.id}`); }}
                            className={cn(
                                "w-full flex flex-col text-left p-3 rounded-md transition-all cursor-pointer border focus-ring",
                                isCurrent
                                    ? "bg-surface-active/50 border-border text-foreground shadow-sm"
                                    : "border-transparent hover:bg-surface-active/60 text-foreground"
                            )}
                        >
                            <div className="flex justify-between items-center gap-2 w-full">
                                <span className="truncate font-semibold text-sm">#{channelName}</span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-1 w-full">
                                {board.emojis.join(" ")} • Min: {board.reaction_threshold} Reactions
                            </div>
                        </button>
                    );
                }}
                noActivePlaceholder={
                    <div className="max-w-md mx-auto space-y-4 text-center">
                        <div className="space-y-1">
                            <h3 className="font-semibold text-foreground">No Starboard Selected</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Select an active starboard from the sidebar to edit its settings, or create a new board to start highlighting popular server messages.
                            </p>
                        </div>
                        <Button onClick={() => { setIsCreateModalOpen(true); }}>
                            Create Your First Starboard
                        </Button>
                    </div>
                }
            >
                {config && (
                    <StarboardConfigEditor
                        config={config}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        isPending={isPending}
                        onDelete={onDelete}
                        onChange={setConfig}
                        setIsEmpty={setIsEmpty}
                        isEmpty={isEmpty}
                        guildId={guildId}
                    />
                )}
            </ConfigListLayout>

            <StarboardCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); }}
                channelMap={channelMap}
                onSave={onSave}
                guildId={guildId}
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={() => { handleSave(); }}
                    isSaving={isPending}
                />
            )}
        </>
    );
}