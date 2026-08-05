import { useState } from "react";
import { banUser, deleteReportedMessage, resolveReportStatus, timeoutUser, warnUser } from "@/features/report/actions";
import { SimpleReportAction } from "@/features/report/types";

export function useReportActions() {
    // UI Loading & Interaction States
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
    const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set());

    const [timeoutReportId, setTimeoutReportId] = useState<number | null>(null);
    const [isTimingOut, setIsTimingOut] = useState<boolean>(false);

    const [banReportId, setBanReportId] = useState<number | null>(null);
    const [isBanning, setIsBanning] = useState<boolean>(false);

    const [warnReportId, setWarnReportId] = useState<number | null>(null);
    const [isWarning, setIsWarning] = useState<boolean>(false);

    const handleDeleteMessage = async (reportId: number, channelId: string, messageId: string) => {
        if (deletingIds.has(reportId)) return;

        setDeletingIds((prev) => {
            const next = new Set(prev);
            next.add(reportId);
            return next;
        });

        await deleteReportedMessage(reportId, channelId, messageId);

        setDeletingIds((prev) => {
            const next = new Set(prev);
            next.delete(reportId);
            return next;
        });
    };

    const handleResolveReport = async (reportId: number, targetStatus: SimpleReportAction) => {
        if (resolvingIds.has(reportId)) return;

        setResolvingIds((prev) => {
            const next = new Set(prev);
            next.add(reportId);
            return next;
        });

        const result = await resolveReportStatus(reportId, targetStatus);

        setResolvingIds((prev) => {
            const next = new Set(prev);
            next.delete(reportId);
            return next;
        });

        if (!result.success) {
            alert("Error updating report status. Please try again.");
        }
    };

    const handleTimeoutUser = async (durationMins: number, reason: string) => {
        if (!timeoutReportId || isTimingOut) return;

        setIsTimingOut(true);
        const result = await timeoutUser(timeoutReportId, durationMins, reason);
        setIsTimingOut(false);

        if (result.success) {
            setTimeoutReportId(null);
        } else {
            alert("Error applying timeout. Please try again.");
        }
    };

    const handleWarnUser = async (reason: string) => {
        if (!warnReportId || isWarning) return;

        setIsWarning(true);
        const result = await warnUser(warnReportId, reason);
        setIsWarning(false);

        if (result.success) {
            setWarnReportId(null);
        } else {
            alert("Error applying warning. Please try again.");
        }
    };

    const handleBanUser = async (durationMins: number | undefined, reason: string) => {
        if (!banReportId || isBanning) return;

        setIsBanning(true);
        const result = await banUser(banReportId, durationMins, reason);
        setIsBanning(false);

        if (result.success) {
            setBanReportId(null);
        } else {
            alert("Error applying ban. Please try again.");
        }
    };

    return {
        deletingIds,
        resolvingIds,
        timeoutReportId,
        setTimeoutReportId,
        isTimingOut,
        banReportId,
        setBanReportId,
        isBanning,
        warnReportId,
        setWarnReportId,
        isWarning,
        handleDeleteMessage,
        handleResolveReport,
        handleTimeoutUser,
        handleWarnUser,
        handleBanUser,
    };
}