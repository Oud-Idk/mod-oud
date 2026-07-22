"use client";

import { ReactNode } from "react";
import { useSSEInfiniteScroll } from "@/hooks/useSSEInfiniteScroll";

interface LogViewerProps<T> {
    title: string;
    sseUrl: string;
    initialHistory?: T[];
    guildId: string;
    fetchMoreAction: (guild_id: string, before_id: number) => Promise<T[]>;
    eventName: string;
    emptyText?: string;
    renderItem: (log: T) => ReactNode;
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
}: LogViewerProps<T>) {
    const { logs, status, hasMore, isLoadingMore, observerTarget } = useSSEInfiniteScroll<T>({
        sseUrl,
        initialHistory,
        guildId,
        fetchMoreAction,
        eventName,
    });

    return (
        <div className="p-4 border rounded-xl border-neutral-500 shadow-md">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-lg font-semibold">{title}</h3>
                </div>
                <span
                    className={`text-sm px-1 py-0.5 rounded text-white ${
                        status === "CONNECTED" ? "bg-green-500" : "bg-red-500"
                    }`}
                >
                    {status}
                </span>
            </div>

            <div className="space-y-2 max-h-125 overflow-y-auto pr-1 scrollbar-thin">
                {logs.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">{emptyText}</p>
                ) : (
                    <>
                        {logs.map((log) => renderItem(log))}

                        <div
                            ref={observerTarget} className="h-10 flex items-center justify-center text-xs"
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