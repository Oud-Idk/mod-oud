import { useState } from "react";
import { deleteReportedMessageAction } from "../actions";
import type { UseReportActionsReturn } from "../hooks";

type DeleteSlice = Pick<UseReportActionsReturn, "deletingIds" | "handleDeleteMessage">;

export function useDeleteReport(guildId: string): DeleteSlice {
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set<number>());

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

    return { deletingIds, handleDeleteMessage };
}
