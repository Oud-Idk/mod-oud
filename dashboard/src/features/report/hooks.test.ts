// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useReportActions } from "./hooks";

// Prevent loading Server Actions and their server dependencies (next-auth, next/server)
vi.mock("./actions", () => ({
    deleteReportedMessageAction: vi.fn().mockResolvedValue(undefined),
    resolveReportStatusAction: vi.fn().mockResolvedValue(undefined),
    timeoutUserAction: vi.fn().mockResolvedValue(undefined),
    warnUserAction: vi.fn().mockResolvedValue(undefined),
    banUserAction: vi.fn().mockResolvedValue(undefined),
}));

describe("useReportActions", () => {
    it("initializes and merges all report action slices", () => {
        const { result } = renderHook(() => useReportActions("guild_123"));

        // useDeleteReport slice
        expect(result.current.deletingIds).toEqual(new Set());
        expect(typeof result.current.handleDeleteMessage).toBe("function");

        // useResolveReport slice
        expect(result.current.resolvingIds).toEqual(new Set());
        expect(typeof result.current.handleResolveReport).toBe("function");

        // useTimeoutUser slice
        expect(result.current.timeoutReportId).toBeNull();
        expect(result.current.isTimingOut).toBe(false);
        expect(typeof result.current.setTimeoutReportId).toBe("function");
        expect(typeof result.current.handleTimeoutUser).toBe("function");

        // useWarnUser slice
        expect(result.current.warnReportId).toBeNull();
        expect(result.current.isWarning).toBe(false);
        expect(typeof result.current.setWarnReportId).toBe("function");
        expect(typeof result.current.handleWarnUser).toBe("function");

        // useBanUser slice
        expect(result.current.banReportId).toBeNull();
        expect(result.current.isBanning).toBe(false);
        expect(typeof result.current.setBanReportId).toBe("function");
        expect(typeof result.current.handleBanUser).toBe("function");
    });

    it("allows updating state via composed dispatchers", () => {
        const { result } = renderHook(() => useReportActions("guild_123"));

        act(() => {
            result.current.setWarnReportId(42);
            result.current.setBanReportId(99);
            result.current.setTimeoutReportId(101);
        });

        expect(result.current.warnReportId).toBe(42);
        expect(result.current.banReportId).toBe(99);
        expect(result.current.timeoutReportId).toBe(101);
    });
});