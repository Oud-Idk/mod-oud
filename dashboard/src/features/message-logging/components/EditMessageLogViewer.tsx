"use client";

import { LogViewer } from "./LogViewer";

import { EditedMessage } from "@/features/message-logging/types";
import { ReactNode } from "react";

interface EditedMessageLogViewerProps {
    sseUrl: string;
    initialHistory?: EditedMessage[];
    channelMap?: Record<string, string>;
    guildId: string;
    fetchMoreAction: (guild_id: string, before_id: number) => Promise<EditedMessage[]>;
}

export function EditedMessageLogViewer({
    sseUrl,
    initialHistory = [],
    channelMap = {},
    guildId,
    fetchMoreAction,
}: EditedMessageLogViewerProps): ReactNode {
    return (
        <LogViewer<EditedMessage> title="Edit Logs"
            sseUrl={sseUrl}
            initialHistory={initialHistory}
            guildId={guildId}
            fetchMoreAction={fetchMoreAction}
            eventName="message-edit"
            emptyText="No edited messages recorded..."
            renderItem={(log) => {
                const channelName = channelMap[log.channel_id]
                    ? `#${channelMap[log.channel_id]}`
                    : `ID: ${log.channel_id}`;

                return (
                    <div key={log.id} className="p-3 border border-yellow-900/50 rounded">
                        <div className="flex justify-between mb-1">
                            <span className="font-semibold">
                                Message Edited | {log.author_id}
                                <span className="text-neutral-500 ml-2">in {channelName}</span>
                            </span>
                            <span>{new Date(log.updated_at).toLocaleString()}</span>
                        </div>
                        <div className="text-sm wrap-break-word space-y-1">
                            {log.old_content && (
                                <p className="text-neutral-500">
                                    Old: {log.old_content}
                                </p>
                            )}
                            <p>New: {log.new_content}</p>
                        </div>
                    </div>
                );
            }}
        />
    );
}