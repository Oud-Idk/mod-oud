"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { StarboardConfig as StarboardConfigType, StarboardConfigInput } from "@/types/config/starboard";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { StarboardCreateModal } from "./StarboardCreateModal";
import { StarboardConfig } from "./StarboardConfig";
import { isDeepEqual } from "@/utils/embed";
import { Pad } from "@/components/Pad";

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

    // Local states
    const [config, setConfig] = useState<StarboardConfigInput | null>(activeConfig);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isPending, startTransition] = useTransition();


    const isDirty = activeConfig && !isDeepEqual(config, activeConfig);

    // Sync active record transitions
    useEffect(() => {
        setConfig(activeConfig);
    }, [activeConfig]);

    const handleCancel = () => {
        setConfig(activeConfig);
    };

    const handleChange = useCallback((updated: StarboardConfigInput) => {
        setConfig(updated);
    }, []);

    const handleSave = () => {
        if (!config || !config.id) return;
        startTransition(async () => {
            try {
                await onSave(config);
            } catch (err) {
                alert("Failed to save configuration.");
            }
        });
    };


    return (
        <div className="gap-6 items-start mt-4 shrink">
            {/* First div: flex container, height-constrained, hiding its own overflow */}
            <div className="md:col-span-1 flex flex-col min-h-70 max-h-70 p-4 rounded-lg border overflow-hidden">
                {/* Header (stays fixed at the top) */}
                <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-semibold uppercase tracking-wider">Boards</span>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="text-xs px-2.5 py-1 bg-zinc-850 bg-neutral-300/10 hover:bg-neutral-300/30 transition border rounded-md cursor-pointer"
                    >
                        + Create
                    </button>
                </div>

                {/* Second div: takes remaining height and handles scrolling */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 mt-4">
                    {starboardConfigs.length === 0 ? (
                        <p className="text-xs text-zinc-500 py-2">No starboards configured yet.</p>
                    ) : (
                        starboardConfigs.map((board) => {
                            const isCurrent = activeConfig?.id === board.id;
                            const channelName = channelMap[board.starboard_channel_id] || "unknown-channel";
                            return (
                                <button
                                    key={board.id}
                                    onClick={() => router.push(`/dashboard/${guildId}/starboard?id=${board.id}`)}
                                    className={`w-full text-left px-3 py-2 rounded text-sm transition block cursor-pointer truncate ${
                                        isCurrent
                                            ? "bg-neutral-400/15 hover:bg-neutral-400/20 font-medium"
                                            : "text-neutral-500 hover:bg-neutral-300/15"
                                    }`}
                                >
                                    <div className="truncate font-semibold">#{channelName}</div>
                                    <div className="text-xs text-zinc-500 truncate mt-0.5">
                                        {board.emojis.join(" ")} • Min: {board.reaction_threshold} Reactions
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
            <Pad/>

            {/* Right Panel: Selected Config Form */}
            <div className="md:col-span-3 border border-zinc-850 p-6 rounded-lg">
                {!config ? (
                    <div className="text-center py-12 text-zinc-500 space-y-3">
                        <p className="text-sm">Select an active starboard, or create a new one to begin.</p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="text-xs px-3.5 py-1.5 bg-zinc-850 rounded transition border border-zinc-800 hover:bg-neutral-300/10 cursor-pointer"
                        >
                            Create Your First Starboard
                        </button>
                    </div>
                ) : (
                    <StarboardConfig
                        config={config}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        isPending={isPending}
                        onDelete={onDelete}
                        onChange={handleChange}
                    />
                )}
            </div>

            {/* Save Overlay */}
            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}

            {/* Creation Modal */}
            <StarboardCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                channelMap={channelMap}
                onSave={onSave}
            />
        </div>
    );
}