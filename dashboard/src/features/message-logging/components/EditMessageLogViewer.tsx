"use client";

import { JSX} from "react";
import { LogViewer } from "./LogViewer";
import { EditedMessage } from "@/features/message-logging/types";

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
}: EditedMessageLogViewerProps): JSX.Element {
    return (
        <LogViewer<EditedMessage>
            title="Edit Logs"
            sseUrl={sseUrl}
            initialHistory={initialHistory}
            guildId={guildId}
            fetchMoreAction={fetchMoreAction}
            eventName="message-edit"
            emptyText="No edited messages recorded..."
            renderItem={(log) => {
                const channelName = channelMap[log.channel_id];

                return (
                    <div
                        key={log.id}
                        className="p-3.5 border border-warning-subtle bg-surface-muted/30 hover:border-border-active rounded-lg transition-all space-y-2"
                    >
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-foreground flex items-center gap-2">
                                <span>Message Edited</span>
                                <span className="text-muted-foreground font-normal">| Author ID: {log.author_id}</span>
                                <span className="text-brand font-medium">{channelName}</span>
                            </span>
                            <span className="text-muted-foreground">
                                {new Date(log.updated_at).toLocaleString()}
                            </span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                            {log.old_content !== null && (
                                <div className="text-sm text-muted-foreground bg-surface/50 p-2.5 rounded-md border border-border/50 wrap-break-word font-normal">
                                    <span className="font-bold text-warning/50 mr-1.5 font-mono">OLD:</span>
                                    <span>{log.old_content}</span>
                                </div>
                            )}

                            <div className="text-sm text-foreground/90 bg-surface p-2.5 rounded-md border border-border/60 wrap-break-word font-normal">
                                <span className="font-bold mr-1.5 font-mono">NEW:</span>
                                <span>{log.new_content}</span>
                            </div>
                        </div>
                    </div>
                );
            }}
        />
    );
}