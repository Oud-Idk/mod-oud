"use client";

import React, { useState } from "react";
import { ConfigListLayout } from "@/components/Dashboards/General/ConfigListLayout";
import { useParams, useRouter } from "next/navigation";
import { useConfigForm } from "@/hooks/useConfigForm";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { Giveaway } from "@/types/db/giveaway";
import { SaveGiveawayData } from "@/utils/db/giveaways";
import { GiveawayConfig } from "@/components/Dashboards/Giveaway/GiveawayConfig";
import { GiveawayCreateModal } from "@/components/Dashboards/Giveaway/GiveawayCreateModal";

interface GiveawaysBodyProps {
    giveaways: Giveaway[];
    activeConfig: Giveaway;
    onSave: (config: SaveGiveawayData) => Promise<Giveaway>;
    channelMap: Record<string, string>;
    onDelete: (id: number) => Promise<boolean>;
    onSend: (id: number) => Promise<{ message_id: string }>;
    onDeleteDiscordMessage: (id: number) => Promise<{ success: boolean }>;
    userId: string;
}

export function GiveawaysBody({
    giveaways,
    activeConfig,
    onSave,
    channelMap,
    onDelete,
    onSend,
    onDeleteDiscordMessage,
    userId,
}: GiveawaysBodyProps) {
    const router = useRouter();
    const params = useParams();
    const guildId = params?.guild_id as string;


    const { config, isPending, isDirty, isEmpty, setIsEmpty, handleSave, handleCancel, handleChange } =
        useConfigForm<Giveaway | null>({
            initialConfig: activeConfig,
            onSave: async (updatedConfig) => {
                if (updatedConfig) {
                    await onSave({
                        ...updatedConfig,
                        host_id: updatedConfig.host_id || userId,
                    });
                }
            },
        });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <div>
            <ConfigListLayout<Giveaway> title="Giveaways"
                onCreateClick={() => setIsCreateModalOpen(true)}
                items={giveaways}
                renderItem={(item) => {
                    const isCurrent = activeConfig?.id === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => router.push(`/dashboard/${guildId}/giveaways?id=${item.id}`)}
                            className={`w-full text-left px-3 py-2 rounded text-sm transition block cursor-pointer truncate ${
                                isCurrent
                                    ? "bg-neutral-400/15 font-medium"
                                    : "hover:bg-neutral-300/15"
                            }`}
                        >
                            <div className="truncate font-semibold">{item.prize}</div>
                        </button>
                    );
                }}
                hasActiveConfig={!!config}
                handleSave={handleSave}
                handleCancel={handleCancel}
                noActivePlaceholder={
                    <>
                        <p className="text-sm">Select a giveaway or create a new one to begin.</p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="text-xs px-3.5 py-1.5 bg-zinc-850 rounded border border-neutral-500 hover:bg-neutral-300/10 cursor-pointer"
                        >
                            Create Your First Giveaway
                        </button>
                    </>
                }
            >
                <GiveawayConfig
                    key={config?.id}
                    config={config!}
                    channelMap={channelMap}
                    isPending={isPending}
                    isDirty={isDirty}
                    onDelete={onDelete}
                    onSend={onSend}
                    guildId={guildId}
                    onChange={handleChange}
                    setIsEmpty={setIsEmpty}
                    isEmpty={isEmpty}
                    onDeleteDiscordMessage={onDeleteDiscordMessage}
                />
            </ConfigListLayout>

            <GiveawayCreateModal
                isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSave={(v) =>
                onSave({
                    channel_id: v.channel_id || "",
                    guild_id: guildId,
                    format: "TEXT",
                    prize: v.prize || "",
                    winner_count: v.winner_count || 1,
                    end_time: v.end_time || new Date().toISOString(),
                    is_finished: false,
                    embed: {},
                    content: "",
                    host_id: userId || "",
                })
            } channelMap={channelMap}
            />

            {isDirty && <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}/>}
        </div>
    );
}