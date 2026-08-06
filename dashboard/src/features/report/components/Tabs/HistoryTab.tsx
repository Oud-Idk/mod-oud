import React, { Dispatch, SetStateAction } from "react";
import { ReportedMessageCard } from "@/features/report/components/ReportMessageCard/ReportedMessageCard";
import { ReportedMessage, SimpleReportAction } from "@/features/report/types";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";
import { cn } from "@/lib/cn";

export type ConnectingStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
type ReportStatus = "ALL" | "OPEN" | "CLOSED";

interface HistoryTabProps {
    status: ConnectingStatus;
    setStatusFilter: Dispatch<SetStateAction<ReportStatus>>;
    statusFilter: ReportStatus;
    filteredLogs: ReportedMessage[];
    deletingIds: Set<number>;
    resolvingIds: Set<number>;
    handleDeleteMessage: (reportId: number, channelId: string, messageId: string) => Promise<void>;
    handleResolveReport: (reportId: number, status: SimpleReportAction) => Promise<void>;
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
    return (
        <div className="border border-border rounded-xl bg-surface p-4 flex flex-col space-y-4 shadow-sm">
            {/* Header + Status & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-foreground">Recent Reports</h3>
                    <ConnectionStatusPill
                        status={status}
                        connectedText="Connected"
                        disconnectedText={status === "CONNECTING" ? "Connecting..." : "Disconnected"}
                    />
                </div>

                {/* Filter Segmented Control */}
                <div
                    className="flex items-center gap-1 bg-surface-muted p-1 rounded-lg text-xs self-start sm:self-auto border border-border-subtle">
                    <button
                        type="button"
                        onClick={() => setStatusFilter("ALL")}
                        className={cn(
                            "px-2.5 py-1 rounded-md font-medium transition cursor-pointer border",
                            statusFilter === "ALL"
                                ? "bg-surface-active text-foreground border-border shadow-xs font-semibold"
                                : "text-muted-foreground hover:text-foreground border-transparent"
                        )}
                    >
                        All
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter("OPEN")}
                        className={cn(
                            "px-2.5 py-1 rounded-md font-medium transition cursor-pointer border",
                            statusFilter === "OPEN"
                                ? "bg-warning-subtle text-warning border-warning/30 font-semibold"
                                : "text-muted-foreground hover:text-foreground border-transparent"
                        )}
                    >
                        Opened
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter("CLOSED")}
                        className={cn(
                            "px-2.5 py-1 rounded-md font-medium transition cursor-pointer border",
                            statusFilter === "CLOSED"
                                ? "bg-success-subtle text-success border-success/30 font-semibold"
                                : "text-muted-foreground hover:text-foreground border-transparent"
                        )}
                    >
                        Closed
                    </button>
                </div>
            </div>

            <div
                className="space-y-4 max-h-125 overflow-y-auto p-4 rounded-xl border border-border-subtle bg-surface-muted/30">
                {filteredLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-12 text-center">
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

                {isLoadingMore && (
                    <p className="text-center text-xs text-muted-foreground pt-2">Loading older records...</p>
                )}
            </div>
        </div>
    );
}