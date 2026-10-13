import { useState } from "react";
import { warnUserAction } from "../actions";
import type { UseReportActionsReturn } from "../hooks";

type WarnSlice = Pick<
    UseReportActionsReturn,
    "warnReportId" | "setWarnReportId" | "isWarning" | "handleWarnUser"
>;

export function useWarnUser(guildId: string): WarnSlice {
    const [warnReportId, setWarnReportId] = useState<number | null>(null);
    const [isWarning, setIsWarning] = useState<boolean>(false);

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

    return { warnReportId, setWarnReportId, isWarning, handleWarnUser };
}
