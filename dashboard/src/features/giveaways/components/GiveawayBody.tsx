"use client";

import React, { ReactNode, useState } from "react";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { useRouter } from "next/navigation";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { Giveaway, SaveGiveawayData } from "@/features/giveaways/types";
import { GiveawayConfig } from "@/features/giveaways/components/GiveawayConfig";
import { GiveawayCreateModal } from "@/features/giveaways/components/GiveawayCreateModal";
import { cn } from "@/lib/cn";

interface GiveawaysBodyProps {
    giveaways: Giveaway[];
    activeConfig: Giveaway;
    onSave: (config: SaveGiveawayData) => Promise<Giveaway>;
    channelMap: Record<string, string>;
    onDelete: (id: number) => Promise<boolean>;
    onSend: (id: number) => Promise<{ message_id: string }>;
    onDeleteDiscordMessage: (id: number) => Promise<void>;
    userId: string;
    guildId: string;
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
    guildId
}: GiveawaysBodyProps): ReactNode {
    const router = useRouter();

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
            <ConfigListLayout<Giveaway>
                title="Giveaways"
                onCreateClick={() => setIsCreateModalOpen(true)}
                items={giveaways}
                renderItem={(item) => {
                    const isCurrent = activeConfig?.id === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => router.push(`/dashboard/${guildId}/giveaways?id=${item.id}`)}
                            className={cn(
                                "w-full flex flex-col text-left p-3 rounded-md transition-all cursor-pointer border focus-ring",
                                isCurrent
                                    ? "bg-surface-active/50 border-border text-foreground shadow-sm"
                                    : "border-transparent hover:bg-surface-active/60 text-foreground"
                            )}
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
                        <p className="text-sm text-muted-foreground">Select a giveaway or create a new one to begin.</p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="text-xs px-3.5 py-1.5 bg-surface-muted border border-border hover:bg-surface-active rounded-lg transition text-foreground cursor-pointer focus-ring"
                        >
                            Create Your First Giveaway
                        </button>
                    </>
                }
            >
                {config && (
                    <GiveawayConfig
                        key={config.id}
                        config={config}
                        channelMap={channelMap}
                        isPending={isPending}
                        isDirty={isDirty}
                        isEmpty={isEmpty}
                        guildId={guildId}
                        onDelete={onDelete}
                        onSend={onSend}
                        onChange={handleChange}
                        setIsEmpty={setIsEmpty}
                        onDeleteDiscordMessage={onDeleteDiscordMessage}
                    />
                )}
            </ConfigListLayout>

            <GiveawayCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={(v) =>
                    onSave({
                        channel_id: v.channel_id || "",
                        guild_id: guildId,
                        format: "TEXT",
                        prize: v.prize || "",
                        winner_count: v.winner_count || 1,
                        end_time: v.end_time || new Date().toISOString(),
                        embed: {},
                        content: "",
                        host_id: userId || "",
                    })
                }
                channelMap={channelMap}
            />

            {isDirty && <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending} />}
        </div>
    );
}