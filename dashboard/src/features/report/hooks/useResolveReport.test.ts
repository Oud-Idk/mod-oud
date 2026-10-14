// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resolveReportStatusAction } from "../actions";
import type { ReportAction } from "../types";
import { useResolveReport } from "./useResolveReport";

vi.mock("../actions", () => ({
    resolveReportStatusAction: vi.fn<
        (guildId: string, reportId: number, status: ReportAction) => Promise<void>
    >(),
}));

const action = vi.mocked(resolveReportStatusAction);
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

describe("useResolveReport", () => {
    it("resolves and clears the id on success", async () => {
        const { result } = renderHook(() => useResolveReport("guild_123"));

        act(() => {
            void result.current.handleResolveReport(1, "ACTIONED");
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledWith("guild_123", 1, "ACTIONED");
            expect(result.current.resolvingIds.has(1)).toBe(false);
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
        const { result } = renderHook(() => useResolveReport("guild_123"));

        // Separate flushes: the guard reads rendered state, like real clicks do.
        act(() => {
            void result.current.handleResolveReport(1, "DISMISSED");
        });
        act(() => {
            void result.current.handleResolveReport(1, "DISMISSED");
            void result.current.handleResolveReport(2, "DISMISSED");
        });
        act(() => {
            for (const resolveAction of resolvers) resolveAction();
        });

        await waitFor(() => {
            expect(action).toHaveBeenCalledTimes(2);
            expect(result.current.resolvingIds.size).toBe(0);
        });
    });

    it("alerts the message and clears the id on failure", async () => {
        action.mockRejectedValue(new Error("gone"));
        const { result } = renderHook(() => useResolveReport("guild_123"));

        act(() => {
            void result.current.handleResolveReport(1, "ACTIONED");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("gone");
            expect(result.current.resolvingIds.has(1)).toBe(false);
        });
    });

    it("alerts a fallback for a non-error failure", async () => {
        action.mockRejectedValue("nope");
        const { result } = renderHook(() => useResolveReport("guild_123"));

        act(() => {
            void result.current.handleResolveReport(1, "ACTIONED");
        });

        await waitFor(() => {
            expect(alertMock).toHaveBeenCalledWith("Failed to resolve report.");
        });
    });
});
