// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { z } from "zod";
import { useConfigForm } from "./useConfigForm";
import { toast } from "sonner";

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

interface FormConfig {
    name: string;
    nested: { count: number };
}

const initialConfig: FormConfig = { name: "Guild", nested: { count: 1 } };

function saver(): (config: FormConfig) => Promise<void> {
    return vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("useConfigForm", () => {
    it("exposes the initial config as clean", () => {
        const { result } = renderHook(() => useConfigForm({ initialConfig, onSave: saver() }));

        expect(result.current.config).toEqual(initialConfig);
        expect(result.current.isDirty).toBe(false);
        expect(result.current.resetKey).toBe(0);
        expect(result.current.isPending).toBe(false);
    });

    it("tracks dirtiness through nested edits", () => {
        const { result } = renderHook(() => useConfigForm({ initialConfig, onSave: saver() }));

        act(() => {
            result.current.setConfig({ name: "Guild", nested: { count: 2 } });
        });
        expect(result.current.isDirty).toBe(true);

        act(() => {
            result.current.setConfig(initialConfig);
        });
        expect(result.current.isDirty).toBe(false);
    });

    it("saves the edited config and toasts success", async () => {
        const onSave = saver();
        const { result } = renderHook(() => useConfigForm({ initialConfig, onSave }));

        act(() => {
            result.current.setConfig({ name: "Renamed", nested: { count: 1 } });
        });
        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith({ name: "Renamed", nested: { count: 1 } });
            expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
                "Configuration saved successfully"
            );
        });
    });

    it("skips the save and toasts on schema failure", () => {
        const onSave = saver();
        const badConfig: FormConfig = { name: "", nested: { count: 1 } };
        const schema = z.object({ name: z.string().min(1), nested: z.object({ count: z.number() }) });
        const { result } = renderHook(() =>
            useConfigForm({ initialConfig: badConfig, onSave, schema })
        );

        act(() => {
            result.current.handleSave();
        });

        expect(onSave).not.toHaveBeenCalled();
        expect(vi.mocked(toast.error)).toHaveBeenCalled();
    });

    it("toasts the thrown message when the save rejects", async () => {
        const onSave = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("db down"));
        const { result } = renderHook(() => useConfigForm({ initialConfig, onSave }));

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(vi.mocked(toast.error)).toHaveBeenCalledWith("db down");
        });
    });

    it("toasts a fallback when the save throws a non-error", async () => {
        const onSave = vi.fn<() => Promise<void>>().mockRejectedValue("nope");
        const { result } = renderHook(() => useConfigForm({ initialConfig, onSave }));

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to save configuration");
        });
    });

    it("restores the initial config and bumps resetKey on cancel", () => {
        const { result } = renderHook(() => useConfigForm({ initialConfig, onSave: saver() }));

        act(() => {
            result.current.setConfig({ name: "Edited", nested: { count: 9 } });
        });
        act(() => {
            result.current.handleCancel();
        });

        expect(result.current.config).toEqual(initialConfig);
        expect(result.current.isDirty).toBe(false);
        expect(result.current.resetKey).toBe(1);
    });

    it("resyncs when a new initial config arrives", () => {
        const { result, rerender } = renderHook(
            ({ initial }: { initial: FormConfig }) =>
                useConfigForm({ initialConfig: initial, onSave: saver() }),
            { initialProps: { initial: initialConfig } }
        );
        const next: FormConfig = { name: "Fresh", nested: { count: 3 } };

        rerender({ initial: next });

        expect(result.current.config).toEqual(next);
        expect(result.current.isDirty).toBe(false);
    });

    it("reports pending across the save transition", async () => {
        let resolveSave: () => void = () => undefined;
        const onSave = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveSave = resolve;
                })
        );
        const { result } = renderHook(() => useConfigForm({ initialConfig, onSave }));

        act(() => {
            result.current.handleSave();
        });
        expect(result.current.isPending).toBe(true);

        act(() => {
            resolveSave();
        });
        await waitFor(() => {
            expect(result.current.isPending).toBe(false);
        });
    });
});
