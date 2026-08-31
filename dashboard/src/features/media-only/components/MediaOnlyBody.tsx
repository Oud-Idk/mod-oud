"use client";

import React, { JSX, useState } from "react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { cn } from "@/lib/cn";
import { MediaOnlyChannel, mediaOnlyChannelSchema } from "@/features/media-only/types";
import { MediaOnlyChannelEditor } from "./MediaOnlyChannelEditor";
import { MediaOnlyCreateModal } from "./MediaOnlyCreateModal";
import { toast } from "sonner";

interface MediaOnlyBodyProps {
    channels: MediaOnlyChannel[];
    onSave: (channels: MediaOnlyChannel[], removedChannelIds: string[]) => Promise<void>;
    textChannelMap: Record<string, string>;
    roleMap: Record<string, string>;
}

const DEFAULT_CHANNEL: MediaOnlyChannel = {
    channelId: "",
    enabled: true,
    allowImages: true,
    allowVideos: true,
    allowAudio: false,
    allowGif: true,
    allowLinks: true,
    allowEmbeddedText: true,
    autoThread: false,
    threadNameTemplate: "Discussion - {user}",
    deleteWarningAfterSecs: 5,
    exemptRoles: [],
};

export function MediaOnlyBody({
    channels,
    onSave,
    textChannelMap,
    roleMap,
}: MediaOnlyBodyProps): JSX.Element {
    const [activeChannelId, setActiveChannelId] = useState<string | null>(
        channels[0]?.channelId ?? null
    );
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave,
        handleCancel,
    } = useConfigForm<MediaOnlyChannel[]>({
        initialConfig: channels,
        onSave: async (newChannels) => {
            const removedChannelIds = channels
                .filter((c) => !newChannels.some((n) => n.channelId === c.channelId))
                .map((c) => c.channelId);

            await onSave(newChannels, removedChannelIds);
        },
    });

    const activeChannel = config.find((c) => c.channelId === activeChannelId) ?? null;

    const handleCreate = (channelId: string): void => {
        setConfig((prev) => {
            if (prev.some((c) => c.channelId === channelId)) return prev;
            return [...prev, { ...DEFAULT_CHANNEL, channelId }];
        });
        setActiveChannelId(channelId);
    };

    const handleUpdate = (patch: Partial<MediaOnlyChannel>): void => {
        if (activeChannelId === null) return;
        setConfig((prev) =>
            prev.map((c) => (c.channelId === activeChannelId ? { ...c, ...patch } : c))
        );
    };

    const handleRemove = (): void => {
        if (activeChannelId === null) return;
        setConfig((prev) => prev.filter((c) => c.channelId !== activeChannelId));
        setActiveChannelId(null);
    };

    const handleSaveChannel = (): void => {
        for (const channel of config) {
            const result = mediaOnlyChannelSchema.safeParse(channel);
            if (!result.success) {
                toast.error(result.error.issues[0].message);
                return;
            }
        }
        handleSave();
    };

    return (
        <>
            <ConfigListLayout<MediaOnlyChannel>
                title="Channels"
                createButtonText="+ Add"
                onCreateClick={() => { setIsCreateModalOpen(true); }}
                items={config}
                emptyMessage="No media-only channels configured yet."
                hasActiveConfig={!!activeChannel}
                isDirty={isDirty}
                isPending={isPending}
                handleSave={handleSaveChannel}
                handleCancel={handleCancel}
                renderItem={(channel) => {
                    const isCurrent = activeChannelId === channel.channelId;

                    return (
                        <button
                            key={channel.channelId}
                            type="button"
                            onClick={() => { setActiveChannelId(channel.channelId); }}
                            className={cn(
                                "w-full flex flex-col text-left p-3 rounded-md transition-all cursor-pointer border focus-ring",
                                isCurrent
                                    ? "bg-surface-active/50 border-border text-foreground shadow-sm"
                                    : "border-transparent hover:bg-surface-active/60 text-foreground"
                            )}
                        >
                            <span className="truncate font-semibold text-sm">
                                #{textChannelMap[channel.channelId]}
                            </span>
                            <span
                                className={cn(
                                    "text-xs mt-1 w-full",
                                    channel.enabled ? "text-brand" : "text-muted-foreground"
                                )}
                            >
                                {channel.enabled ? "Enabled" : "Disabled"}
                            </span>
                        </button>
                    );
                }}
                noActivePlaceholder={
                    <div className="max-w-md mx-auto space-y-4 text-center">
                        <div className="space-y-1">
                            <h3 className="font-semibold text-foreground">No Channel Selected</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Select a channel from the list to edit its media-only settings, or add a new channel.
                            </p>
                        </div>
                    </div>
                }
            >
                {activeChannel && (
                    <MediaOnlyChannelEditor
                        channel={activeChannel}
                        textChannelMap={textChannelMap}
                        roleMap={roleMap}
                        isPending={isPending}
                        onChange={handleUpdate}
                        onRemove={handleRemove}
                    />
                )}
            </ConfigListLayout>

            <MediaOnlyCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); }}
                textChannelMap={textChannelMap}
                configuredIds={config.map((c) => c.channelId)}
                onCreate={handleCreate}
            />
        </>
    );
}
