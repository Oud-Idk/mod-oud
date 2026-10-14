// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { timeoutUserAction } from "../actions";
import { useTimeoutUser } from "./useTimeoutUser";

vi.mock("../actions", () => ({
    timeoutUserAction: vi.fn<
        (guildId: string, reportId: number, durationMins: number, reason?: string) => Promise<void>
    >(),
}));

const action = vi.mocked(timeoutUserAction);
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

describe("useTimeoutUser", () => {
    it("does nothing without a selected report", async () => {
        const { result } = renderHook(() => useTimeoutUser("guild_123"));

        await act(async () => {
            await result.current.handleTimeoutUser(60, "Spam");
        });

        expect(action).not.toHaveBeenCalled();
        expect(alertMock).not.toHaveBeenCalled();
    });

    it("times out and clears the selection on success", async () => {
        const { result } = renderHook(() => useTimeoutUser("guild_123"));

        act(() => {
            result.current.setTimeoutReportId(7);
        });
        act(() => {
            void result.current.handleTimeoutUser(60, "Spam");
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledWith("guild_123", 7, 60, "Spam");
            expect(result.current.timeoutReportId).toBeNull();
            expect(result.current.isTimingOut).toBe(false);
        });
    });

    it("ignores a second submit while one is in flight", async () => {
        let resolveAction: () => void = () => undefined;
        action.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveAction = resolve;
                })
        );
        const { result } = renderHook(() => useTimeoutUser("guild_123"));

        act(() => {
            result.current.setTimeoutReportId(7);
        });
        // Separate flush: the guard reads rendered state, like real clicks do.
        act(() => {
            void result.current.handleTimeoutUser(60, "Spam");
        });
        act(() => {
            void result.current.handleTimeoutUser(60, "Spam");
        });
        act(() => {
            resolveAction();
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledTimes(1);
            expect(result.current.isTimingOut).toBe(false);
        });
    });

    it("alerts the message, keeps the selection, and resets on failure", async () => {
        action.mockRejectedValue(new Error("gone"));
        const { result } = renderHook(() => useTimeoutUser("guild_123"));

        act(() => {
            result.current.setTimeoutReportId(7);
        });
        act(() => {
            void result.current.handleTimeoutUser(60, "Spam");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("gone");
            expect(result.current.timeoutReportId).toBe(7);
            expect(result.current.isTimingOut).toBe(false);
        });
    });

    it("alerts a fallback for a non-error failure", async () => {
        action.mockRejectedValue("nope");
        const { result } = renderHook(() => useTimeoutUser("guild_123"));

        act(() => {
            result.current.setTimeoutReportId(7);
        });
        act(() => {
            void result.current.handleTimeoutUser(60, "Spam");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("Error applying timeout.");
        });
    });
});
