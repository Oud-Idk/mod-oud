import { useCallback, useState, useTransition } from "react";
import { isDeepEqual } from "@/features/_shared/embed";
import { SaveTicketConfigSchema, type TicketConfig } from "../types";
import { toast } from "sonner";

export function useTicketConfig(
    initialConfig: TicketConfig,
    onSave: (config: TicketConfig) => Promise<void>,
    onSendTicketMessage: (channelId: string) => Promise<string | undefined>,
    onDeleteTicketMessage: (channelId: string, messageId: string) => Promise<void>
) {
    const [config, setConfig] = useState<TicketConfig>(initialConfig);
    const [isPending, startTransition] = useTransition();
    const [isProcessingAction, setIsProcessingAction] = useState(false);

    const isDirty = !isDeepEqual(config, initialConfig);
    const isWarnThresholdInvalid = config.warnThreshold > config.deleteThreshold;

    const handleSave = useCallback(() => {
        const result = SaveTicketConfigSchema.safeParse(config);
        if (!result.success) {
            const firstMessage = result.error.issues[0]?.message || "Invalid configuration.";
            toast.error(firstMessage);
            return;
        }

        startTransition(async () => {
            try {
                await onSave(config);
                toast.success("Configuration saved successfully!");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to save configuration.");
            }
        });
    }, [config, onSave]);

    const handleCancel = useCallback(() => {
        setConfig(initialConfig);
    }, [initialConfig]);

    const handleSendLiveMessage = async (): Promise<void> => {
        if (!config.channelId) return;
        setIsProcessingAction(true);
        try {
            await onSendTicketMessage(config.channelId);
            toast.success("Ticket panel posted to Discord successfully!");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to post ticket panel.");
        } finally {
            setIsProcessingAction(false);
        }
    };

    const handleDeleteLiveMessage = async (): Promise<void> => {
        if (!config.channelId || !config.postedMessageId) return;
        setIsProcessingAction(true);
        try {
            await onDeleteTicketMessage(config.channelId, config.postedMessageId);
            toast.success("Ticket panel deleted successfully!");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete ticket panel.");
        } finally {
            setIsProcessingAction(false);
        }
    };

    return {
        config,
        setConfig,
        isDirty,
        isPending,
        isProcessingAction,
        handleSave,
        handleCancel,
        handleSendLiveMessage,
        handleDeleteLiveMessage,
        isWarnThresholdInvalid,
    };
}