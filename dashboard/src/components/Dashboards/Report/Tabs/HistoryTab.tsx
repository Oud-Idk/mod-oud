import React, { Dispatch, SetStateAction } from "react";
import { ReportedMessageCard } from "@/components/Dashboards/Report/ReportMessageCard/ReportedMessageCard";
import { ReportedMessage, SimpleReportStatus, ViewTicketStatus } from "@/types/db";
import { ConnectingStatus } from "@/types";

interface HistoryTabProps {
    status: ConnectingStatus;
    setStatusFilter: Dispatch<SetStateAction<ViewTicketStatus>>;
    statusFilter: ViewTicketStatus;
    filteredLogs: ReportedMessage[];
    deletingIds: Set<number>;
    resolvingIds: Set<number>;
    handleDeleteMessage: (reportId: number, channelId: string, messageId: string) => Promise<void>;
    handleResolveReport: (reportId: number, targetStatus: SimpleReportStatus) => Promise<void>;
    setTimeoutReportId: Dispatch<SetStateAction<number | null>>;
    setBanReportId: Dispatch<SetStateAction<number | null>>;
    setWarnReportId: Dispatch<SetStateAction<number | null>>;
    setActiveImageUrl: Dispatch<SetStateAction<string | null>>;
    observerTarget: React.RefObject<HTMLDivElement | null>;
    isLoadingMore: boolean;
}

export function HistoryTab({
    status,
    setStatusFilter,
    statusFilter,
    filteredLogs,
    deletingIds,
    resolvingIds,
    handleDeleteMessage,
    handleResolveReport,
    setTimeoutReportId,
    setBanReportId,
    setWarnReportId,
    setActiveImageUrl,
    observerTarget,
    isLoadingMore,
}: HistoryTabProps) {
    return <div className="border rounded-xl p-4 flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
                <h3 className="text-lg font-semibold">Recent Reports</h3>
                <div className="flex items-center space-x-1.5">
                    <span
                        className={`h-2 w-2 rounded-full ${
                            status === "CONNECTED" ? "bg-emerald-500" :
                                status === "CONNECTING" ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                        }`}
                    />
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">{status}</span>
                </div>
            </div>

            <div className="flex items-center space-x-1 bg-neutral-200/50 dark:bg-neutral-800/50 p-1 rounded-lg text-xs self-start sm:self-auto border border-neutral-300 dark:border-neutral-700">
                <button
                    type="button"
                    onClick={() => setStatusFilter("ALL")}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        statusFilter === "ALL"
                            ? "bg-white dark:bg-zinc-700 shadow text-neutral-900 dark:text-white"
                            : "text-zinc-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                    }`}
                >
                    All
                </button>
                <button
                    type="button"
                    onClick={() => setStatusFilter("OPEN")}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        statusFilter === "OPEN"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "text-zinc-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-neutral-200 border border-transparent"
                    }`}
                >
                    Opened
                </button>
                <button
                    type="button"
                    onClick={() => setStatusFilter("CLOSED")}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        statusFilter === "CLOSED"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : "text-zinc-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-neutral-200 border border-transparent"
                    }`}
                >
                    Closed
                </button>
            </div>
        </div>

        <div className="space-y-4 max-h-125 overflow-y-auto scrollbar-thin p-2 rounded-xl">
            {filteredLogs.length === 0 ? (
                <p className="text-sm text-zinc-500 py-12 text-center">
                    {statusFilter === "OPEN"
                        ? "No open reports."
                        : statusFilter === "CLOSED"
                            ? "No closed reports."
                            : "No reports recorded yet."}
                </p>
            ) : (
                filteredLogs.map((log) => (
                    <ReportedMessageCard
                        key={log.id}
                        log={log}
                        isDeleting={deletingIds.has(log.id)}
                        isResolving={resolvingIds.has(log.id)}
                        onDelete={handleDeleteMessage}
                        onResolve={handleResolveReport}
                        onTimeoutClick={setTimeoutReportId}
                        onBanClick={setBanReportId}
                        onWarnClick={setWarnReportId}
                        onImageClick={setActiveImageUrl}
                    />
                ))
            )}

            <div ref={observerTarget} className="h-4 w-full">
                {isLoadingMore
                    ? <p className="text-center text-xs text-zinc-500 pt-2">Loading older records...</p>
                    : <p className="text-center text-xs text-zinc-500 pt-2">That's everything for you.</p>
                }
            </div>
        </div>
    </div>;
}