import { useState } from "react";
import { resolveReportStatusAction } from "../actions";
import type { SimpleReportAction } from "../types";
import type { UseReportActionsReturn } from "../hooks";

type ResolveSlice = Pick<UseReportActionsReturn, "resolvingIds" | "handleResolveReport">;

export function useResolveReport(guildId: string): ResolveSlice {
    const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set<number>());

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

    return { resolvingIds, handleResolveReport };
}
