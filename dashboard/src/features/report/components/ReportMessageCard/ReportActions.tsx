"use client";

import { ReportActionButton } from "@/features/report/components/ReportActionButton";
import { ReportedMessage, SimpleReportAction } from "@/features/report/types";

interface ReportActionsProps {
    log: ReportedMessage;
    isDeleting: boolean;
    isResolving: boolean;
    onDelete: (reportId: number, channelId: string, messageId: string) => Promise<void>;
    onResolve: (reportId: number, status: SimpleReportAction) => Promise<void>;
    onTimeoutClick: (reportId: number) => void;
    onWarnClick: (reportId: number) => void;
    onBanClick: (reportId: number) => void;
}

export function ReportActions({
    log,
    isDeleting,
    isResolving,
    onDelete,
    onResolve,
    onTimeoutClick,
    onBanClick,
    onWarnClick,
}: ReportActionsProps) {
    const statusLower = log.status?.toLowerCase();
    const isResolved = statusLower === "ACTIONED" || statusLower === "DISMISSED";
    const isMessageDeleted = log.message_deleted;

    if (isResolved) {
        return (
            <div
                className="pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-end"
            >
                <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    Report Resolved ({log.status?.replace("_", " ")})
                </span>
            </div>
        );
    }

    const isInteractionDisabled = isResolving || isDeleting;

    return (
        <div
            className="pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-end gap-2"
        >
            {isMessageDeleted ? (
                <span className="text-xs text-neutral-500 font-semibold mr-auto">
                    Message Deleted
                </span>
            ) : (
                <ReportActionButton
                    onClick={() => onDelete(log.id, log.channel_id, log.message_id)}
                    disabled={isInteractionDisabled}
                    color="rose"
                >Delete Message</ReportActionButton>
            )}

            {!log.user_banned && (
                <ReportActionButton
                    onClick={() => onBanClick(log.id)} disabled={isInteractionDisabled} color="red"
                >Ban User</ReportActionButton>
            )}

            {!log.user_timed_out && (
                <ReportActionButton
                    onClick={() => onTimeoutClick(log.id)} disabled={isInteractionDisabled} color="orange"
                >Timeout User</ReportActionButton>
            )}

            {!log.user_warned && (
                <ReportActionButton
                    onClick={() => onWarnClick(log.id)} disabled={isInteractionDisabled} color="yellow"
                >Warn User</ReportActionButton>
            )}

            <ReportActionButton
                onClick={() => onResolve(log.id, "ACTIONED")} disabled={isInteractionDisabled} color="blue"
            >{isResolving ? "Resolving..." : "Mark as Actioned"}</ReportActionButton>

            <ReportActionButton
                onClick={() => onResolve(log.id, "DISMISSED")} disabled={isInteractionDisabled} color="neutral"
            >{isResolving ? "Resolving..." : "Mark as Dismissed"}</ReportActionButton>
        </div>
    );
}