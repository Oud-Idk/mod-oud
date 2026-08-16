"use client";

import { JSX, useState } from "react";
import Image from "next/image";
import { LogViewer } from "./LogViewer";
import { Modal } from "@/components/ui/Modal";
import { DeletedMessage } from "@/features/message-logging/types";
import { AttachmentImage } from "@/components/layout/AttachmentImage";

interface DeletedMessageLogViewerProps {
    sseUrl: string;
    initialHistory?: DeletedMessage[];
    channelMap?: Record<string, string>;
    guildId: string;
    fetchMoreAction: (guild_id: string, before_id: number) => Promise<DeletedMessage[]>;
}

export function DeletedMessageLogViewer({
    sseUrl,
    initialHistory = [],
    channelMap = {},
    guildId,
    fetchMoreAction,
}: DeletedMessageLogViewerProps): JSX.Element {
    const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

    return (
        <>
            <LogViewer<DeletedMessage>
                title="Deletion Logs"
                sseUrl={sseUrl}
                initialHistory={initialHistory}
                guildId={guildId}
                fetchMoreAction={fetchMoreAction}
                eventName="message-delete"
                emptyText="No activity recorded yet..."
                renderItem={(log) => {
                    const channelName = `#${channelMap[log.channel_id]}`;

                    const images = log.attachment_url !== null
                        ? log.attachment_url
                            .split(",")
                            .map((url) => url.trim())
                            .filter((url) => url.length > 0)
                        : [];

                    return (
                        <div
                            key={log.id}
                            className="p-3.5 border border-danger-border bg-surface-muted/30 hover:border-border-active rounded-lg transition-all space-y-2"
                        >
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-foreground flex items-center gap-2">
                                    <span>Message Deleted</span>
                                    <span className="text-muted-foreground font-normal">| Author ID: {log.author_id}</span>
                                    <span className="text-brand font-medium">{channelName}</span>
                                </span>
                                <span className="text-muted-foreground text-[11px]">
                                    {new Date(log.deleted_at).toLocaleString()}
                                </span>
                            </div>

                            {log.deleted_by_id !== null && (
                                <p className="text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">Deleted By:</span> {log.deleted_by_id}
                                </p>
                            )}

                            {log.content.trim() !== "" && (
                                <p className="text-sm text-foreground/90 bg-surface p-2.5 rounded-md border border-border/60 wrap-break-word font-normal">
                                    {log.content}
                                </p>
                            )}

                            {images.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {images.map((url, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() =>{  setActiveImageUrl(url); }}
                                            className="group relative block overflow-hidden rounded-md border border-border hover:border-brand cursor-zoom-in text-left transition-all"
                                        >
                                            <AttachmentImage url={url} index={index} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }}
            />

            {activeImageUrl !== null && (
                <Modal onClose={() =>{  setActiveImageUrl(null); }} headerText="Attached Image">
                    <div className="relative w-full max-h-[80vh] flex items-center justify-center p-2">
                        <Image
                            src={activeImageUrl}
                            alt="The Attached Image"
                            width={800}
                            height={600}
                            className="rounded-lg object-contain"
                        />
                    </div>
                </Modal>
            )}
        </>
    );
}