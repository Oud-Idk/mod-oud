import type { Dispatch, SetStateAction } from "react";
import type { SimpleReportAction } from "./types";
import { useBanUser } from "./hooks/useBanUser";
import { useDeleteReport } from "./hooks/useDeleteReport";
import { useResolveReport } from "./hooks/useResolveReport";
import { useTimeoutUser } from "./hooks/useTimeoutUser";
import { useWarnUser } from "./hooks/useWarnUser";

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
    return {
        ...useDeleteReport(guildId),
        ...useResolveReport(guildId),
        ...useTimeoutUser(guildId),
        ...useWarnUser(guildId),
        ...useBanUser(guildId),
    };
}
