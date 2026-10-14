// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { deleteReportedMessageAction } from "../actions";
import { useDeleteReport } from "./useDeleteReport";

vi.mock("../actions", () => ({
    deleteReportedMessageAction: vi.fn<
        (guildId: string, reportId: number, channelId: string, messageId: string) => Promise<void>
    >(),
}));

const action = vi.mocked(deleteReportedMessageAction);
const alertMock = vi.fn<(message?: string) => void>();

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("alert", alertMock);
    action.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("useDeleteReport", () => {
    it("deletes and clears the id on success", async () => {
        const { result } = renderHook(() => useDeleteReport("guild_123"));

        act(() => {
            void result.current.handleDeleteMessage(1, "chan_1", "msg_1");
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledWith("guild_123", 1, "chan_1", "msg_1");
            expect(result.current.deletingIds.has(1)).toBe(false);
        });
    });

    it("blocks a repeat submit but lets other reports through", async () => {
        const resolvers: (() => void)[] = [];
        action.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolvers.push(resolve);
                })
        );
        const { result } = renderHook(() => useDeleteReport("guild_123"));

        // Separate flushes: the guard reads rendered state, like real clicks do.
        act(() => {
            void result.current.handleDeleteMessage(1, "chan_1", "msg_1");
        });
        act(() => {
            void result.current.handleDeleteMessage(1, "chan_1", "msg_1");
            void result.current.handleDeleteMessage(2, "chan_1", "msg_2");
        });
        act(() => {
            for (const resolveAction of resolvers) resolveAction();
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledTimes(2);
            expect(result.current.deletingIds.size).toBe(0);
        });
    });

    it("alerts the message and clears the id on failure", async () => {
        action.mockRejectedValue(new Error("gone"));
        const { result } = renderHook(() => useDeleteReport("guild_123"));

        act(() => {
            void result.current.handleDeleteMessage(1, "chan_1", "msg_1");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("gone");
            expect(result.current.deletingIds.has(1)).toBe(false);
        });
    });

    it("alerts a fallback for a non-error failure", async () => {
        action.mockRejectedValue("nope");
        const { result } = renderHook(() => useDeleteReport("guild_123"));

        act(() => {
            void result.current.handleDeleteMessage(1, "chan_1", "msg_1");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("Failed to delete message.");
        });
    });
});
