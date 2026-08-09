"use client";

import { JSX} from "react";
import { useSSEInfiniteScroll } from "@/lib/hooks/useSSEInfiniteScroll";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";

interface LogViewerProps<T> {
    title: string;
    sseUrl: string;
    initialHistory?: T[];
    guildId: string;
    fetchMoreAction: (guild_id: string, before_id: number) => Promise<T[]>;
    eventName: string;
    emptyText?: string;
    renderItem: (log: T) => JSX.Element;
}

export function LogViewer<T extends { id: number }>({
    title,
    sseUrl,
    initialHistory = [],
    guildId,
    fetchMoreAction,
    eventName,
    emptyText = "No activity recorded yet...",
    renderItem,
}: LogViewerProps<T>): JSX.Element {
    const { logs, status, hasMore, isLoadingMore, observerTarget } = useSSEInfiniteScroll<T>({
        sseUrl,
        initialHistory,
        guildId,
        fetchMoreAction,
        eventName,
    });

    return (
        <div className="p-4 border border-border bg-surface rounded-xl shadow-xs">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-border-subtle">
                <h3 className="text-lg font-semibold text-foreground tracking-tight">{title}</h3>

                <ConnectionStatusPill status={status} />
            </div>

            {/* Scrollable Container */}
            <div className="space-y-2.5 max-h-125 overflow-y-auto pr-1.5 scrollbar-thin">
                {logs.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8 font-medium">{emptyText}</p>
                ) : (
                    <>
                        {logs.map((log) => renderItem(log))}

                        <div
                            ref={observerTarget}
                            className="h-10 flex items-center justify-center text-xs text-muted-foreground font-medium"
                        >
                            {isLoadingMore && <span>Loading more logs...</span>}
                            {!hasMore && logs.length > 0 && <span>End of history</span>}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}