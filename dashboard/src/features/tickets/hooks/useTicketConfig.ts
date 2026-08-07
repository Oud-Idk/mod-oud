import { useCallback, useState, useTransition } from "react";
import { isDeepEqual } from "@/features/_shared/embed";
import { TicketConfig, SaveTicketConfigSchema } from "@/features/tickets/types";

export function useTicketConfig(
    initialConfig: TicketConfig,
    onSave: (config: TicketConfig) => Promise<void>,
    onSendTicketMessage: (channelId: string) => Promise<string | void>,
    onDeleteTicketMessage: (channelId: string, messageId: string) => Promise<void>
) {
    const [config, setConfig] = useState<TicketConfig>(initialConfig);
    const [isPending, startTransition] = useTransition();
    const [isProcessingAction, setIsProcessingAction] = useState(false);
    const [status, setStatus] = useState<{ type: "SUCCESS" | "ERROR"; message: string } | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Honest Dirty Check: Only checks if the form was modified
    const isDirty = !isDeepEqual(config, initialConfig);
    const isWarnThresholdInvalid = config.warnThreshold > config.deleteThreshold;

    const handleSave = useCallback(() => {
        setValidationError(null);

        // Strict Save Validation via Zod superRefine
        const result = SaveTicketConfigSchema.safeParse(config);
        if (!result.success) {
            const firstMessage = result.error.issues[0]?.message || "Invalid configuration.";
            setValidationError(firstMessage);
            return;
        }

        startTransition(async () => {
            try {
                await onSave(config);
                setStatus({ type: "SUCCESS", message: "Configuration saved successfully!" });
            } catch (err) {
                setStatus({
                    type: "ERROR",
                    message: err instanceof Error ? err.message : "Failed to save configuration."
                });
            }
        });
    }, [config, onSave]);

    const handleCancel = useCallback(() => {
        setConfig(initialConfig);
        setValidationError(null);
        setStatus(null);
    }, [initialConfig]);

    const handleSendLiveMessage = async () => {
        if (!config.channelId) return;
        setIsProcessingAction(true);
        setStatus(null);
        try {
            await onSendTicketMessage(config.channelId);
            setStatus({ type: "SUCCESS", message: "Ticket panel posted to Discord successfully!" });
        } catch (error) {
            setStatus({
                type: "ERROR",
                message: error instanceof Error ? error.message : "Failed to post ticket panel."
            });
        } finally {
            setIsProcessingAction(false);
        }
    };

    const handleDeleteLiveMessage = async () => {
        if (!config.channelId || !config.postedMessageId) return;
        setIsProcessingAction(true);
        setStatus(null);
        try {
            await onDeleteTicketMessage(config.channelId, config.postedMessageId);
            setStatus({ type: "SUCCESS", message: "Ticket panel deleted successfully!" });
        } catch (error) {
            setStatus({
                type: "ERROR",
                message: error instanceof Error ? error.message : "Failed to delete ticket panel."
            });
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
        status,
        validationError,
        handleSave,
        handleCancel,
        handleSendLiveMessage,
        handleDeleteLiveMessage,
        isWarnThresholdInvalid
    };
}