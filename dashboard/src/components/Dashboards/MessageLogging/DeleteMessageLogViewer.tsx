"use client";

import { useState } from "react";
import { LogViewer } from "./LogViewer";
import { Modal } from "@/components/Modal";
import Image from "next/image";

interface DeletedMessage {
    id: number;
    message_id: string;
    author_id: string;
    author_name: string;
    channel_id: string;
    guild_id: string;
    content: string;
    attachment_url: string;
    deleted_at: string;
    deleted_by_name?: string;
    deleted_by_id?: string;
}

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
}: DeletedMessageLogViewerProps) {
    const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

    return (
        <>
            <LogViewer<DeletedMessage> title="Deletion Logs"
                sseUrl={sseUrl}
                initialHistory={initialHistory}
                guildId={guildId}
                fetchMoreAction={fetchMoreAction}
                eventName="message-delete"
                emptyText="No activity recorded yet..."
                renderItem={(log) => {
                    const channelName = channelMap[log.channel_id]
                        ? `#${channelMap[log.channel_id]}`
                        : `ID: ${log.channel_id}`;

                    const images = log.attachment_url
                        ? log.attachment_url
                            .split(",")
                            .map((url) => url.trim())
                            .filter((url) => url.length > 0)
                        : [];

                    return (
                        <div key={log.id} className="p-3 border border-red-900/50 rounded">
                            <div className="flex justify-between mb-1">
                                <span className="font-semibold">
                                    Message Deleted | {log.author_name}
                                    <span className="text-neutral-500 ml-2">in {channelName}</span>
                                </span>
                                <span>{new Date(log.deleted_at).toLocaleString()}</span>
                            </div>

                            {log.deleted_by_name && (
                                <p className="text-sm wrap-break-word">Deleted By: {log.deleted_by_name}</p>
                            )}

                            {log.content && (
                                <p className="text-sm wrap-break-word">{log.content}</p>
                            )}

                            {images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {images.map((url, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => setActiveImageUrl(url)}
                                            className="group relative block overflow-hidden rounded border border-red-800/50 hover:border-red-500/50 cursor-zoom-in text-left"
                                        >
                                            <img
                                                src={url}
                                                alt={`Attachment ${index + 1}`}
                                                className="max-w-50 max-h-37.5 object-contain block transition-opacity"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = "none";
                                                }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }}
            />

            {activeImageUrl && (
                <Modal onClose={() => setActiveImageUrl(null)} headerText="Image">
                    <Image src={activeImageUrl} alt="The Attached Image"/>
                </Modal>
            )}
        </>
    );
}