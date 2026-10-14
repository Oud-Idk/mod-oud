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
        let resolveSend: () => void = () => undefined;
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
            resolveSend();
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
