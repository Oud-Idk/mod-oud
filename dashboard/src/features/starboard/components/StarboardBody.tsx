"use client";

import React, { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { useConfigForm } from "@/components/dashboard/useConfigForm";

import { StarboardCreateModal } from "./StarboardCreateModal";
import { StarboardConfigEditor } from "./StarboardConfigEditor";

import type { StarboardConfig, StarboardConfigInput } from "../types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

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
}: StarboardBodyProps): ReactNode {
    const router = useRouter();

    const {
        config,
        isPending,
        isDirty,
        setIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm<StarboardConfigInput | null>({
        initialConfig: activeConfig,
        onSave: async (updatedConfig) => {
            if (updatedConfig) await onSave(updatedConfig);
        },
    });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <>
            <ConfigListLayout<StarboardConfig>
                title="Boards"
                onCreateClick={() => setIsCreateModalOpen(true)}
                items={starboardConfigs}
                emptyMessage="No starboards configured yet."
                hasActiveConfig={!!config}
                isDirty={isDirty}
                isPending={isPending}
                handleSave={handleSave}
                handleCancel={handleCancel}
                renderItem={(board) => {
                    const isCurrent = activeConfig?.id === board.id;
                    const channelName = channelMap[board.starboard_channel_id] || "unknown-channel";
                    return (
                        <button
                            key={board.id}
                            onClick={() => router.push(`/dashboard/${guildId}/starboard?id=${board.id}`)}
                            className={cn(
                                "w-full flex flex-col text-left p-3 rounded-md transition-all cursor-pointer border",
                                isCurrent
                                    ? "bg-surface-active border-border text-foreground shadow-sm font-medium"
                                    : "bg-surface/50 border-transparent hover:bg-surface-active/60 text-foreground"
                            )}
                        >
                            <div className="truncate font-semibold text-sm">#{channelName}</div>
                            <div className="text-xs text-muted-foreground truncate mt-1">
                                {board.emojis.join(" ")} • Min: {board.reaction_threshold} Reactions
                            </div>
                        </button>
                    );
                }}
                noActivePlaceholder={
                    <div className="max-w-md mx-auto space-y-2 text-center">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground mb-1">No Starboard Selected</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Select an active starboard from the sidebar to edit its settings, or create a new board to start highlighting popular server messages.
                            </p>
                        </div>
                        <Button onClick={() => setIsCreateModalOpen(true)}>
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
                        onChange={handleChange}
                        setIsEmpty={setIsEmpty}
                        guildId={guildId}
                    />
                )}
            </ConfigListLayout>

            <StarboardCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                channelMap={channelMap}
                onSave={onSave}
                guildId={guildId}
            />
        </>
    );
}