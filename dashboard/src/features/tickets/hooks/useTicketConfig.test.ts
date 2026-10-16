// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTicketConfig } from "./useTicketConfig";
import { TicketConfigSchema, type TicketConfig } from "../types";
import { toast } from "sonner";

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const initialConfig: TicketConfig = TicketConfigSchema.parse({
    enabled: true,
    categoryId: "cat_1",
    channelId: "chan_1",
    ticketRoleId: "role_1",
});

function callbacks(): {
    onSave: (config: TicketConfig) => Promise<void>;
    onSendTicketMessage: (channelId: string) => Promise<string | undefined>;
    onDeleteTicketMessage: (channelId: string, messageId: string) => Promise<void>;
} {
    return {
        onSave: vi.fn<(config: TicketConfig) => Promise<void>>().mockResolvedValue(undefined),
        onSendTicketMessage: vi
            .fn<(channelId: string) => Promise<string | undefined>>()
            .mockResolvedValue("msg_1"),
        onDeleteTicketMessage: vi
            .fn<(channelId: string, messageId: string) => Promise<void>>()
            .mockResolvedValue(undefined),
    };
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("useTicketConfig", () => {
    it("exposes the initial config as clean", () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        expect(result.current.config).toEqual(initialConfig);
        expect(result.current.isDirty).toBe(false);
        expect(result.current.isWarnThresholdInvalid).toBe(false);
        expect(result.current.isProcessingAction).toBe(false);
    });

    it("flags an inverted warn threshold and dirties on edit", () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            result.current.setConfig({ ...initialConfig, warnThreshold: 50 });
        });

        expect(result.current.isDirty).toBe(true);
        expect(result.current.isWarnThresholdInvalid).toBe(true);
    });

    it("restores the initial config on cancel", () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            result.current.setConfig({ ...initialConfig, warnThreshold: 50 });
        });
        act(() => {
            result.current.handleCancel();
        });

        expect(result.current.config).toEqual(initialConfig);
        expect(result.current.isDirty).toBe(false);
    });

    it("saves a valid config and toasts success", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith(initialConfig);
            expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
                "Configuration saved successfully!"
            );
        });
    });

    it("skips the save and toasts on validation failure", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const invalid = { ...initialConfig, categoryId: null };
        const { result } = renderHook(() =>
            useTicketConfig(invalid, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(vi.mocked(toast.error)).toHaveBeenCalled();
        });
        expect(onSave).not.toHaveBeenCalled();
    });

    it("toasts the thrown message when the save rejects", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        vi.mocked(onSave).mockRejectedValue(new Error("db down"));
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(vi.mocked(toast.error)).toHaveBeenCalledWith("db down");
        });
    });

    it("posts the panel and tracks processing", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        let resolveSend: (value: string | undefined) => void = () => undefined;
        vi.mocked(onSendTicketMessage).mockImplementation(
            () =>
                new Promise<string | undefined>((resolve) => {
                    resolveSend = resolve;
                })
        );
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            void result.current.handleSendLiveMessage();
        });
        expect(result.current.isProcessingAction).toBe(true);

        act(() => {
            resolveSend(undefined);
        });
        await waitFor(() => {
            expect(onSendTicketMessage).toHaveBeenCalledWith("chan_1");
            expect(result.current.isProcessingAction).toBe(false);
            expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
                "Ticket panel posted to Discord successfully!"
            );
        });
    });

    it("skips posting when no channel is set", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(
                { ...initialConfig, channelId: null },
                onSave,
                onSendTicketMessage,
                onDeleteTicketMessage
            )
        );

        await act(async () => {
            await result.current.handleSendLiveMessage();
        });

        expect(onSendTicketMessage).not.toHaveBeenCalled();
        expect(result.current.isProcessingAction).toBe(false);
    });

    it("deletes the posted panel message", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(
                { ...initialConfig, postedMessageId: "msg_9" },
                onSave,
                onSendTicketMessage,
                onDeleteTicketMessage
            )
        );

        act(() => {
            void result.current.handleDeleteLiveMessage();
        });

        await waitFor(() => {
            expect(onDeleteTicketMessage).toHaveBeenCalledWith("chan_1", "msg_9");
            expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
                "Ticket panel deleted successfully!"
            );
        });
    });

    it("skips deleting when the panel was never posted", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        await act(async () => {
            await result.current.handleDeleteLiveMessage();
        });

        expect(onDeleteTicketMessage).not.toHaveBeenCalled();
        expect(result.current.isProcessingAction).toBe(false);
    });

    it("toasts the thrown message when deleting rejects", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        vi.mocked(onDeleteTicketMessage).mockRejectedValue(new Error("gone"));
        const { result } = renderHook(() =>
            useTicketConfig(
                { ...initialConfig, postedMessageId: "msg_9" },
                onSave,
                onSendTicketMessage,
                onDeleteTicketMessage
            )
        );

        act(() => {
            void result.current.handleDeleteLiveMessage();
        });

        await waitFor(() => {
            expect(vi.mocked(toast.error)).toHaveBeenCalledWith("gone");
            expect(result.current.isProcessingAction).toBe(false);
        });
    });
});

describe("additional ticket coverage", () => {
    it("does not flag equal thresholds as invalid", () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(
                { ...initialConfig, warnThreshold: 5, deleteThreshold: 5 },
                onSave,
                onSendTicketMessage,
                onDeleteTicketMessage
            )
        );

        expect(result.current.isWarnThresholdInvalid).toBe(false);
    });

    it("skips deleting when channelId is null even with messageId", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const config = { ...initialConfig, channelId: null, postedMessageId: "posted_1" };
        const { result } = renderHook(() =>
            useTicketConfig(config, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        await act(async () => {
            await result.current.handleDeleteLiveMessage();
        });

        expect(onDeleteTicketMessage).not.toHaveBeenCalled();
        expect(result.current.isProcessingAction).toBe(false);
    });

    it("preserves the extracted validation message", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const invalid = { ...initialConfig, categoryId: null };
        const { result } = renderHook(() =>
            useTicketConfig(invalid, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(vi.mocked(toast.error)).toHaveBeenCalled();
        });
        const message = vi.mocked(toast.error).mock.calls[0]?.[0];
        expect(typeof message).toBe("string");
    });
});

describe("mutant killers", () => {
    // Kills ArrayDeclaration: [config, onSave] -> []
    it("saves updated config instead of stale initial config", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        const updatedConfig = { ...initialConfig, warnThreshold: 15 };
        act(() => {
            result.current.setConfig(updatedConfig);
        });

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith(updatedConfig);
            expect(onSave).not.toHaveBeenCalledWith(initialConfig);
        });
    });

    // Kills ArrayDeclaration: [initialConfig] -> []
    it("cancels back to updated initialConfig after hook rerenders", () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const { result, rerender } = renderHook(
            ({ init }) => useTicketConfig(init, onSave, onSendTicketMessage, onDeleteTicketMessage),
            { initialProps: { init: initialConfig } }
        );

        const nextInitial = { ...initialConfig, ticketRoleId: "role_updated" };
        rerender({ init: nextInitial });

        act(() => {
            result.current.setConfig({ ...nextInitial, warnThreshold: 99 });
        });
        expect(result.current.config.warnThreshold).toBe(99);

        act(() => {
            result.current.handleCancel();
        });

        expect(result.current.config).toEqual(nextInitial);
    });

    // Kills BooleanLiteral: setIsProcessingAction(true) -> false in handleDeleteLiveMessage
    it("tracks isProcessingAction while deleting live message", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        let resolveDelete: () => void = () => undefined;
        vi.mocked(onDeleteTicketMessage).mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveDelete = resolve;
                })
        );
        const { result } = renderHook(() =>
            useTicketConfig(
                { ...initialConfig, postedMessageId: "msg_9" },
                onSave,
                onSendTicketMessage,
                onDeleteTicketMessage
            )
        );

        act(() => {
            void result.current.handleDeleteLiveMessage();
        });
        expect(result.current.isProcessingAction).toBe(true);

        act(() => {
            resolveDelete();
        });
        await waitFor(() => {
            expect(result.current.isProcessingAction).toBe(false);
        });
    });

    it("toasts actual schema message instead of default fallback on validation error", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        const invalid = { ...initialConfig, categoryId: null };
        const { result } = renderHook(() =>
            useTicketConfig(invalid, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            const message = vi.mocked(toast.error).mock.calls[0]?.[0];
            expect(message).not.toBe("Invalid configuration.");
            expect(typeof message).toBe("string");
            if (typeof message === "string") {
                expect(message.length).toBeGreaterThan(0);
            }
        });
    });

    // Kills StringLiteral: "Failed to save configuration." -> ""
    it("toasts fallback error message when onSave rejects with a non-Error", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        vi.mocked(onSave).mockRejectedValue("string rejection");
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        act(() => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
                "Failed to save configuration."
            );
        });
    });

    // Kills BlockStatement in handleSendLiveMessage catch block
    it("toasts error message when handleSendLiveMessage rejects with Error", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        vi.mocked(onSendTicketMessage).mockRejectedValue(new Error("send network error"));
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        await act(async () => {
            await result.current.handleSendLiveMessage();
        });

        expect(vi.mocked(toast.error)).toHaveBeenCalledWith("send network error");
        expect(result.current.isProcessingAction).toBe(false);
    });

    // Kills StringLiteral: "Failed to post ticket panel." -> ""
    it("toasts fallback error message when handleSendLiveMessage rejects with non-Error", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        vi.mocked(onSendTicketMessage).mockRejectedValue("raw failure");
        const { result } = renderHook(() =>
            useTicketConfig(initialConfig, onSave, onSendTicketMessage, onDeleteTicketMessage)
        );

        await act(async () => {
            await result.current.handleSendLiveMessage();
        });

        expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to post ticket panel.");
        expect(result.current.isProcessingAction).toBe(false);
    });

    // Kills StringLiteral: "Failed to delete ticket panel." -> ""
    it("toasts fallback error message when handleDeleteLiveMessage rejects with non-Error", async () => {
        const { onSave, onSendTicketMessage, onDeleteTicketMessage } = callbacks();
        vi.mocked(onDeleteTicketMessage).mockRejectedValue("raw failure");
        const { result } = renderHook(() =>
            useTicketConfig(
                { ...initialConfig, postedMessageId: "msg_9" },
                onSave,
                onSendTicketMessage,
                onDeleteTicketMessage
            )
        );

        await act(async () => {
            await result.current.handleDeleteLiveMessage();
        });

        expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to delete ticket panel.");
        expect(result.current.isProcessingAction).toBe(false);
    });
});
