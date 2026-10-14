// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { banUserAction } from "../actions";
import { useBanUser } from "./useBanUser";

vi.mock("../actions", () => ({
    banUserAction: vi.fn<
        (guildId: string, reportId: number, durationMins?: number, reason?: string) => Promise<void>
    >(),
}));

const action = vi.mocked(banUserAction);
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

describe("useBanUser", () => {
    it("does nothing without a selected report", async () => {
        const { result } = renderHook(() => useBanUser("guild_123"));

        await act(async () => {
            await result.current.handleBanUser(1440, "Raid");
        });

        expect(action).not.toHaveBeenCalled();
        expect(alertMock).not.toHaveBeenCalled();
    });

    it("bans and clears the selection on success", async () => {
        const { result } = renderHook(() => useBanUser("guild_123"));

        act(() => {
            result.current.setBanReportId(7);
        });
        act(() => {
            void result.current.handleBanUser(1440, "Raid");
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledWith("guild_123", 7, 1440, "Raid");
            expect(result.current.banReportId).toBeNull();
            expect(result.current.isBanning).toBe(false);
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
        const { result } = renderHook(() => useBanUser("guild_123"));

        act(() => {
            result.current.setBanReportId(7);
        });
        // Separate flush: the guard reads rendered state, like real clicks do.
        act(() => {
            void result.current.handleBanUser(1440, "Raid");
        });
        act(() => {
            void result.current.handleBanUser(1440, "Raid");
        });
        act(() => {
            resolveAction();
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledTimes(1);
            expect(result.current.isBanning).toBe(false);
        });
    });

    it("alerts the message, keeps the selection, and resets on failure", async () => {
        action.mockRejectedValue(new Error("gone"));
        const { result } = renderHook(() => useBanUser("guild_123"));

        act(() => {
            result.current.setBanReportId(7);
        });
        act(() => {
            void result.current.handleBanUser(1440, "Raid");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("gone");
            expect(result.current.banReportId).toBe(7);
            expect(result.current.isBanning).toBe(false);
        });
    });

    it("alerts a fallback for a non-error failure", async () => {
        action.mockRejectedValue("nope");
        const { result } = renderHook(() => useBanUser("guild_123"));

        act(() => {
            result.current.setBanReportId(7);
        });
        act(() => {
            void result.current.handleBanUser(1440, "Raid");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("Error applying ban.");
        });
    });
});
