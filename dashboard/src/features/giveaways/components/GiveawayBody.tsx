"use client";

import React, { ReactNode, useState, useEffect, useTransition } from "react";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { useRouter } from "next/navigation";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { Giveaway, SaveGiveawayData, SaveGiveawaySchema } from "@/features/giveaways/types";
import { GiveawayConfig } from "@/features/giveaways/components/GiveawayConfig";
import { GiveawayCreateModal } from "@/features/giveaways/components/GiveawayCreateModal";
import { isDeepEqual } from "@/features/_shared/embed";
import { cn } from "@/lib/cn";

interface GiveawaysBodyProps {
    giveaways: Giveaway[];
    activeConfig: Giveaway | null;
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
    const [config, setConfig] = useState<Giveaway | null>(activeConfig);
    const [isPending, startTransition] = useTransition();
    const [validationError, setValidationError] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    useEffect(() => {
        setConfig(activeConfig);
        setValidationError(null);
    }, [activeConfig]);

    const isDirty = !isDeepEqual(config, activeConfig);

    const handleSave = () => {
        if (!config) return;
        setValidationError(null);

        const payload: SaveGiveawayData = {
            ...config,
            host_id: config.host_id || userId,
        };

        const result = SaveGiveawaySchema.safeParse(payload);
        if (!result.success) {
            const firstMessage = result.error.issues[0]?.message || "Invalid giveaway configuration.";
            setValidationError(firstMessage);
            return;
        }

        startTransition(async () => {
            try {
                await onSave(payload);
                setValidationError(null);
            } catch (err) {
                setValidationError(err instanceof Error ? err.message : "Failed to save giveaway.");
            }
        });
    };

    const handleCancel = () => {
        setConfig(activeConfig);
        setValidationError(null);
    };

    return (
        <div>
            {validationError && (
                <div className="p-3 mb-4 text-sm text-danger bg-danger-subtle rounded-md font-medium">
                    {validationError}
                </div>
            )}

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
                            className="text-xs px-3.5 py-1.5 bg-surface-muted border border-border hover:bg-surface-active rounded-lg transition text-foreground cursor-pointer focus-ring mt-2"
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
                        guildId={guildId}
                        onDelete={onDelete}
                        onSend={onSend}
                        onChange={setConfig}
                        onDeleteDiscordMessage={onDeleteDiscordMessage}
                    />
                )}
            </ConfigListLayout>

            <GiveawayCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={(v) =>
                    onSave({
                        channel_id: v.channel_id ?? null,
                        guild_id: guildId,
                        format: "TEXT",
                        prize: v.prize || "New Giveaway",
                        winner_count: v.winner_count || 1,
                        end_time: v.end_time || new Date().toISOString(),
                        embed: {},
                        content: "",
                        host_id: userId,
                        message_id: null,
                    })
                }
                channelMap={channelMap}
            />

            {isDirty && <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending} />}
        </div>
    );
}