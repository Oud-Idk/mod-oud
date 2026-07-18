"use client";

import { ReportedMessage } from "@/types/reports";
import { ReportHeader } from "./ReportHeader";
import { ReportContent } from "./ReportContent";
import { ReportActions } from "./ReportActions";

interface ReportedMessageCardProps {
    log: ReportedMessage;
    isDeleting: boolean;
    isResolving: boolean;
    onDelete: (reportId: number, channelId: string, messageId: string) => Promise<void>;
    onResolve: (reportId: number, status: "actioned" | "dismissed") => Promise<void>;
    onTimeoutClick: (reportId: number) => void;
    onWarnClick: (reportId: number) => void;
    onBanClick: (reportId: number) => void;
    onImageClick: (url: string) => void;
}

export function ReportedMessageCard({
    log,
    isDeleting,
    isResolving,
    onDelete,
    onResolve,
    onImageClick,
    onTimeoutClick,
    onBanClick,
    onWarnClick,
}: ReportedMessageCardProps) {
    return (
        <div className="p-3 border border-neutral-300 dark:border-neutral-700 rounded-lg space-y-2 text-sm dark:bg-neutral-300/5 bg-[#fcfcfc]">
            <ReportHeader
                id={log.id}
                status={log.status}
                userWarned={log.user_warned}
                userTimedOut={log.user_timed_out}
                userBanned={log.user_banned}
            />

            <ReportContent
                authorName={log.author_name}
                reporterName={log.reporter_name}
                messageContent={log.content}
                reason={log.reason}
                attachmentUrl={log.attachment_url}
                onImageClick={onImageClick}
            />

            <ReportActions
                log={log}
                isDeleting={isDeleting}
                isResolving={isResolving}
                onDelete={onDelete}
                onResolve={onResolve}
                onTimeoutClick={onTimeoutClick}
                onBanClick={onBanClick}
                onWarnClick={onWarnClick}
            />
        </div>
    );
}