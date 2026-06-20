"use client";

import { ReportedMessage } from "@/types/reports";

interface ReportActionsProps {
    log: ReportedMessage;
    isDeleting: boolean;
    isResolving: boolean;
    onDelete: (reportId: number, channelId: string, messageId: string) => Promise<void>;
    onResolve: (reportId: number, status: "actioned" | "dismissed") => Promise<void>;
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
    const isResolved = statusLower === "actioned" || statusLower === "dismissed";
    const isMessageDeleted = log.message_deleted;

    if (isResolved) {
        return (
            <div
                className="pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-end">
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
            className="pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-end gap-2">
            {isMessageDeleted ? (
                <span className="text-xs text-neutral-500 font-semibold mr-auto">
                    Message Deleted
                </span>
            ) : (
                <button
                    type="button"
                    onClick={() => onDelete(log.id, log.channel_id, log.message_id)}
                    disabled={isInteractionDisabled}
                    className="px-2 py-0.5 text-sm rounded text-rose-500 border border-rose-500 hover:text-rose-400 hover:border-rose-400 transition-all disabled:opacity-50 cursor-pointer"
                >
                    {isDeleting ? "Deleting..." : "Delete Message"}
                </button>
            )}

            {!log.user_banned && (
                <button
                    type="button"
                    onClick={() => onBanClick(log.id)}
                    disabled={isInteractionDisabled}
                    className="px-2 py-0.5 text-sm rounded text-red-500 border border-red-500 hover:text-red-400 hover:border-red-400 transition-all disabled:opacity-50 cursor-pointer"
                >
                    Ban User </button>
            )}

            {!log.user_timed_out && (
                <button
                    type="button"
                    onClick={() => onTimeoutClick(log.id)}
                    disabled={isInteractionDisabled}
                    className="px-2 py-0.5 text-sm rounded text-orange-500 border border-orange-500 hover:text-orange-400 hover:border-orange-400 transition-all disabled:opacity-50 cursor-pointer"
                >
                    Timeout User </button>
            )}


            {!log.user_warned && (
                <button
                    type="button"
                    onClick={() => onWarnClick(log.id)}
                    disabled={isInteractionDisabled}
                    className="px-2 py-0.5 text-sm rounded text-yellow-500 border border-yellow-500 hover:text-yellow-400 hover:border-yellow-400 transition-all disabled:opacity-50 cursor-pointer"
                >
                    Warn User </button>
            )}

            <button
                type="button"
                onClick={() => onResolve(log.id, "actioned")}
                disabled={isInteractionDisabled}
                className="px-2 py-0.5 text-sm rounded text-blue-500 border border-blue-500 hover:text-blue-400 hover:border-blue-400 transition-all disabled:opacity-50 cursor-pointer"
            >
                {isResolving ? "Resolving..." : "Mark as Actioned"}
            </button>

            <button
                type="button"
                onClick={() => onResolve(log.id, "dismissed")}
                disabled={isInteractionDisabled}
                className="px-2 py-0.5 text-sm rounded text-neutral-500 border border-neutral-500 hover:text-neutral-400 hover:border-neutral-400 transition-all disabled:opacity-50 cursor-pointer"
            >
                {isResolving ? "Resolving..." : "Mark as Dismissed"}
            </button>
        </div>
    );
}