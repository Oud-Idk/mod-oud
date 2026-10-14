// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { warnUserAction } from "../actions";
import { useWarnUser } from "./useWarnUser";

vi.mock("../actions", () => ({
    warnUserAction: vi.fn<(guildId: string, reportId: number, reason?: string) => Promise<void>>(),
}));

const action = vi.mocked(warnUserAction);
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

describe("useWarnUser", () => {
    it("does nothing without a selected report", async () => {
        const { result } = renderHook(() => useWarnUser("guild_123"));

        await act(async () => {
            await result.current.handleWarnUser("Toxicity");
        });

        expect(action).not.toHaveBeenCalled();
        expect(alertMock).not.toHaveBeenCalled();
    });

    it("warns and clears the selection on success", async () => {
        const { result } = renderHook(() => useWarnUser("guild_123"));

        act(() => {
            result.current.setWarnReportId(7);
        });
        act(() => {
            void result.current.handleWarnUser("Toxicity");
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledWith("guild_123", 7, "Toxicity");
            expect(result.current.warnReportId).toBeNull();
            expect(result.current.isWarning).toBe(false);
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
        const { result } = renderHook(() => useWarnUser("guild_123"));

        act(() => {
            result.current.setWarnReportId(7);
        });
        // Separate flush: the guard reads rendered state, like real clicks do.
        act(() => {
            void result.current.handleWarnUser("Toxicity");
        });
        act(() => {
            void result.current.handleWarnUser("Toxicity");
        });
        act(() => {
            resolveAction();
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledTimes(1);
            expect(result.current.isWarning).toBe(false);
        });
    });

    it("alerts the message, keeps the selection, and resets on failure", async () => {
        action.mockRejectedValue(new Error("gone"));
        const { result } = renderHook(() => useWarnUser("guild_123"));

        act(() => {
            result.current.setWarnReportId(7);
        });
        act(() => {
            void result.current.handleWarnUser("Toxicity");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("gone");
            expect(result.current.warnReportId).toBe(7);
            expect(result.current.isWarning).toBe(false);
        });
    });

    it("alerts a fallback for a non-error failure", async () => {
        action.mockRejectedValue("nope");
        const { result } = renderHook(() => useWarnUser("guild_123"));

        act(() => {
            result.current.setWarnReportId(7);
        });
        act(() => {
            void result.current.handleWarnUser("Toxicity");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("Error applying warning.");
        });
    });
});
