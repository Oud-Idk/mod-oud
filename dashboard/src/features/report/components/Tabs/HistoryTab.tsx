import React, { Dispatch, JSX, SetStateAction } from "react";
import { ReportedMessageCard } from "@/features/report/components/ReportMessageCard/ReportedMessageCard";
import { ReportedMessage, SimpleReportAction } from "@/features/report/types";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";
import { cn } from "@/lib/cn";

export type ConnectingStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
type ReportStatus = "ALL" | "OPEN" | "CLOSED";

const STATUS_FILTERS: { value: ReportStatus; label: string; activeClass: string }[] = [
    {
        value: "ALL",
        label: "All",
        activeClass: "bg-surface-active text-foreground border-border shadow-xs font-semibold",
    },
    {
        value: "OPEN",
        label: "Opened",
        activeClass: "bg-warning-subtle text-warning border-warning/30 font-semibold",
    },
    {
        value: "CLOSED",
        label: "Closed",
        activeClass: "bg-success-subtle text-success border-success/30 font-semibold",
    },
];

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
    observerTarget: _observerTarget,
    isLoadingMore,
}: HistoryTabProps): JSX.Element {
    return (
        <div className="flex-1 min-h-0 border border-border rounded-xl bg-surface p-4 flex flex-col shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-foreground">Recent Reports</h3>
                    <ConnectionStatusPill
                        status={status}
                        connectedText="Connected"
                        disconnectedText={status === "CONNECTING" ? "Connecting..." : "Disconnected"}
                    />
                </div>

                <div
                    className="flex items-center gap-1 bg-surface-muted p-1 rounded-lg text-xs self-start sm:self-auto border border-border-subtle">
                    {STATUS_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            onClick={() => { setStatusFilter(filter.value); }}
                            className={cn(
                                "px-2.5 py-1 rounded-md font-medium transition cursor-pointer border",
                                statusFilter === filter.value
                                    ? filter.activeClass
                                    : "text-muted-foreground hover:text-foreground border-transparent"
                            )}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 rounded-xl border border-border-subtle bg-surface-muted/30 space-y-4">
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