"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StarboardCreateModal } from "./StarboardCreateModal";
import { StarboardConfig } from "./StarboardConfig";
import { ConfigListLayout } from "@/components/Dashboards/General/ConfigListLayout";
import { useConfigForm } from "@/hooks/useConfigForm";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";
import { StarboardConfig as StarboardConfigType, StarboardConfigInput } from "@/types/db/starboard";

interface StarboardBodyProps {
    starboardConfigs: StarboardConfigType[];
    activeConfig: StarboardConfigType | null;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    onSave: (config: StarboardConfigInput) => Promise<any>;
    onDelete: (id: string) => Promise<void>;
}

export function StarboardBody({
    starboardConfigs,
    activeConfig,
    channelMap,
    roleMap,
    onSave,
    onDelete,
}: StarboardBodyProps) {
    const router = useRouter();
    const params = useParams();
    const guildId = params?.guild_id as string;

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
            <ConfigListLayout<StarboardConfigType> title="Boards"
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
                            className={`w-full text-left px-3 py-2 rounded text-sm transition block cursor-pointer truncate ${
                                isCurrent
                                    ? "bg-neutral-400/15 hover:bg-neutral-400/20 font-medium"
                                    : "hover:bg-neutral-300/15"
                            }`}
                        >
                            <div className="truncate font-semibold">#{channelName}</div>
                            <div className="text-xs text-zinc-500 truncate mt-0.5">
                                {board.emojis.join(" ")} • Min: {board.reaction_threshold} Reactions
                            </div>
                        </button>
                    );
                }}
                noActivePlaceholder={
                    <>
                        <p className="text-sm">Select an active starboard, or create a new one to begin.</p>
                        <PrimaryButton onClick={() => setIsCreateModalOpen(true)}>
                            Create Your First Starboard
                        </PrimaryButton>
                    </>
                }
            >
                <StarboardConfig
                    config={config!}
                    channelMap={channelMap}
                    roleMap={roleMap}
                    isPending={isPending}
                    onDelete={onDelete}
                    onChange={handleChange}
                    setIsEmpty={setIsEmpty}
                />
            </ConfigListLayout>

            <StarboardCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                channelMap={channelMap}
                onSave={onSave}
            />
        </>
    );
}