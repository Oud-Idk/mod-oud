import { useState, type Dispatch, type SetStateAction } from "react";
import {
    banUserAction,
    deleteReportedMessageAction,
    resolveReportStatusAction,
    timeoutUserAction,
    warnUserAction,
} from "./actions";
import type { SimpleReportAction } from "./types";

export interface UseReportActionsReturn {
    deletingIds: Set<number>;
    resolvingIds: Set<number>;
    timeoutReportId: number | null;
    setTimeoutReportId: Dispatch<SetStateAction<number | null>>;
    isTimingOut: boolean;
    banReportId: number | null;
    setBanReportId: Dispatch<SetStateAction<number | null>>;
    isBanning: boolean;
    warnReportId: number | null;
    setWarnReportId: Dispatch<SetStateAction<number | null>>;
    isWarning: boolean;
    handleDeleteMessage: (reportId: number, channelId: string, messageId: string) => Promise<void>;
    handleResolveReport: (reportId: number, targetStatus: SimpleReportAction) => Promise<void>;
    handleTimeoutUser: (durationMins: number, reason: string) => Promise<void>;
    handleWarnUser: (reason: string) => Promise<void>;
    handleBanUser: (durationMins: number | undefined, reason: string) => Promise<void>;
}

export function useReportActions(guildId: string): UseReportActionsReturn {
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set<number>());
    const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set<number>());

    const [timeoutReportId, setTimeoutReportId] = useState<number | null>(null);
    const [isTimingOut, setIsTimingOut] = useState<boolean>(false);

    const [banReportId, setBanReportId] = useState<number | null>(null);
    const [isBanning, setIsBanning] = useState<boolean>(false);

    const [warnReportId, setWarnReportId] = useState<number | null>(null);
    const [isWarning, setIsWarning] = useState<boolean>(false);

    const handleDeleteMessage = async (
        reportId: number,
        channelId: string,
        messageId: string
    ): Promise<void> => {
        if (deletingIds.has(reportId)) return;

        setDeletingIds((prev: Set<number>): Set<number> => new Set(prev).add(reportId));
        try {
            await deleteReportedMessageAction(guildId, reportId, channelId, messageId);
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : "Failed to delete message.");
        } finally {
            setDeletingIds((prev: Set<number>): Set<number> => {
                const next = new Set<number>(prev);
                next.delete(reportId);
                return next;
            });
        }
    };

    const handleResolveReport = async (
        reportId: number,
        targetStatus: SimpleReportAction
    ): Promise<void> => {
        if (resolvingIds.has(reportId)) return;

        setResolvingIds((prev: Set<number>): Set<number> => new Set(prev).add(reportId));
        try {
            await resolveReportStatusAction(guildId, reportId, targetStatus);
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : "Failed to resolve report.");
        } finally {
            setResolvingIds((prev: Set<number>): Set<number> => {
                const next = new Set<number>(prev);
                next.delete(reportId);
                return next;
            });
        }
    };

    const handleTimeoutUser = async (durationMins: number, reason: string): Promise<void> => {
        if (timeoutReportId === null || isTimingOut) return;

        setIsTimingOut(true);
        try {
            await timeoutUserAction(guildId, timeoutReportId, durationMins, reason);
            setTimeoutReportId(null);
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : "Error applying timeout.");
        } finally {
            setIsTimingOut(false);
        }
    };

    const handleWarnUser = async (reason: string): Promise<void> => {
        if (warnReportId === null || isWarning) return;

        setIsWarning(true);
        try {
            await warnUserAction(guildId, warnReportId, reason);
            setWarnReportId(null);
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : "Error applying warning.");
        } finally {
            setIsWarning(false);
        }
    };

    const handleBanUser = async (
        durationMins: number | undefined,
        reason: string
    ): Promise<void> => {
        if (banReportId === null || isBanning) return;

        setIsBanning(true);
        try {
            await banUserAction(guildId, banReportId, durationMins, reason);
            setBanReportId(null);
        } catch (err: unknown) {
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