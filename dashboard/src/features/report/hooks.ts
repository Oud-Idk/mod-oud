import { useState } from "react";
import {
    banUserAction,
    deleteReportedMessageAction,
    resolveReportStatusAction,
    timeoutUserAction,
    warnUserAction,
} from "./actions";
import type { SimpleReportAction } from "./types";

export function useReportActions(guildId: string) {
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

        setDeletingIds((prev) => new Set(prev).add(reportId));
        try {
            await deleteReportedMessageAction(guildId, reportId, channelId, messageId);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete message.");
        } finally {
            setDeletingIds((prev) => {
                const next = new Set(prev);
                next.delete(reportId);
                return next;
            });
        }
    };

    const handleResolveReport = async (reportId: number, targetStatus: SimpleReportAction) => {
        if (resolvingIds.has(reportId)) return;

        setResolvingIds((prev) => new Set(prev).add(reportId));
        try {
            await resolveReportStatusAction(guildId, reportId, targetStatus);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to resolve report.");
        } finally {
            setResolvingIds((prev) => {
                const next = new Set(prev);
                next.delete(reportId);
                return next;
            });
        }
    };

    const handleTimeoutUser = async (durationMins: number, reason: string) => {
        if (!timeoutReportId || isTimingOut) return;

        setIsTimingOut(true);
        try {
            await timeoutUserAction(guildId, timeoutReportId, durationMins, reason);
            setTimeoutReportId(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error applying timeout.");
        } finally {
            setIsTimingOut(false);
        }
    };

    const handleWarnUser = async (reason: string) => {
        if (!warnReportId || isWarning) return;

        setIsWarning(true);
        try {
            await warnUserAction(guildId, warnReportId, reason);
            setWarnReportId(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error applying warning.");
        } finally {
            setIsWarning(false);
        }
    };

    const handleBanUser = async (durationMins: number | undefined, reason: string) => {
        if (!banReportId || isBanning) return;

        setIsBanning(true);
        try {
            await banUserAction(guildId, banReportId, durationMins, reason);
            setBanReportId(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Error applying ban.");
        } finally {
            setIsBanning(false);
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