import { useState } from "react";
import { timeoutUserAction } from "../actions";
import type { UseReportActionsReturn } from "../hooks";

type TimeoutSlice = Pick<
    UseReportActionsReturn,
    "timeoutReportId" | "setTimeoutReportId" | "isTimingOut" | "handleTimeoutUser"
>;

export function useTimeoutUser(guildId: string): TimeoutSlice {
    const [timeoutReportId, setTimeoutReportId] = useState<number | null>(null);
    const [isTimingOut, setIsTimingOut] = useState<boolean>(false);

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

    return { timeoutReportId, setTimeoutReportId, isTimingOut, handleTimeoutUser };
}
