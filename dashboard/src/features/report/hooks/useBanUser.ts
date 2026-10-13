import { useState } from "react";
import { banUserAction } from "../actions";
import type { UseReportActionsReturn } from "../hooks";

type BanSlice = Pick<
    UseReportActionsReturn,
    "banReportId" | "setBanReportId" | "isBanning" | "handleBanUser"
>;

export function useBanUser(guildId: string): BanSlice {
    const [banReportId, setBanReportId] = useState<number | null>(null);
    const [isBanning, setIsBanning] = useState<boolean>(false);

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

    return { banReportId, setBanReportId, isBanning, handleBanUser };
}
