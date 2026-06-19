import { TicketConfig } from "@/types/config";
import { useCallback, useState } from "react";
import { isDeepEqual } from "@/utils/embed";

export function useTicketing(config: TicketConfig, ticketConfig: TicketConfig, isEmpty: boolean, targetChannelIsEmpty: boolean, hookHandleSave: () => void, hookHandleCancel: () => void, setConfig: <T>(value: ((<T>(prevState: TicketConfig) => TicketConfig) | TicketConfig)) => void, onSendTicketMessage: (channelId: string) => Promise<string | void>, onDeleteTicketMessage: (channelId: string, messageId: string) => Promise<void>) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [isWelcomeEmpty, setIsWelcomeEmpty] = useState(false);

    // Kept in parent because they are required to compute isDirty for SavePopup
    const targetCategoryIsEmpty = config.category_id.trim() === "";
    const targetRoleIsEmpty = !config.ticket_role_id || config.ticket_role_id.trim() === "";
    const isWarnThresholdInvalid = config.warn_threshold > config.delete_threshold;

    const isDirty =
        !isDeepEqual(config, ticketConfig) &&
        !isEmpty &&
        !isWelcomeEmpty &&
        !targetCategoryIsEmpty &&
        !targetChannelIsEmpty &&
        !targetRoleIsEmpty &&
        !isWarnThresholdInvalid;

    const handleSave = () => {
        if (isWarnThresholdInvalid) return;
        hookHandleSave();
    };

    const handleCancel = useCallback(() => {
        hookHandleCancel();
        setIsWelcomeEmpty(false);
    }, [hookHandleCancel]);

    const handleWelcomeChange = useCallback((updated: any) => {
        setConfig((prev) => ({
            ...prev,
            welcome_message: {
                format: updated.format as "embed" | "text",
                content: updated.content,
                embed: updated.embed,
                enabled: updated.enabled
            }
        }));
    }, [setConfig]);

    const handleWelcomeEmbedChange = useCallback((embed: any) => {
        setConfig((prev) => ({
            ...prev,
            welcome_message: {
                format: prev.welcome_message?.format ?? "embed",
                content: prev.welcome_message?.content ?? "",
                embed: embed,
                enabled: prev.welcome_message?.enabled
            }
        }));
    }, [setConfig]);

    const handleWarnThresholdChange = useCallback((v: number) => {
        setConfig((prev) => ({ ...prev, warn_threshold: v }));
    }, [setConfig]);

    const handleDeleteThresholdChange = useCallback((v: number) => {
        setConfig((prev) => ({ ...prev, delete_threshold: v }));
    }, [setConfig]);

    const handleBumpEveryChange = useCallback((v: number) => {
        setConfig((prev) => ({ ...prev, bump_every: v }));
    }, [setConfig]);

    const handleSendLiveMessage = async () => {
        if (!config.channel_id) return;
        setIsProcessing(true);
        setStatus(null);
        try {
            await onSendTicketMessage(config.channel_id);
            setStatus({ type: "success", message: "Ticket panel posted to Discord successfully!" });
        } catch (error) {
            setStatus({
                type: "error",
                message: error instanceof Error ? error.message : "Failed to post ticket panel."
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteLiveMessage = async () => {
        if (!config.channel_id || !config.posted_message_id) return;
        setIsProcessing(true);
        setStatus(null);
        try {
            await onDeleteTicketMessage(config.channel_id, config.posted_message_id);
            setStatus({ type: "success", message: "Ticket panel deleted successfully!" });
        } catch (error) {
            setStatus({
                type: "error",
                message: error instanceof Error ? error.message : "Failed to delete ticket panel."
            });
        } finally {
            setIsProcessing(false);
        }
    };
    return {
        isProcessing,
        status,
        setIsWelcomeEmpty,
        isWarnThresholdInvalid,
        isDirty,
        handleSave,
        handleCancel,
        handleWelcomeChange,
        handleWelcomeEmbedChange,
        handleWarnThresholdChange,
        handleDeleteThresholdChange,
        handleBumpEveryChange,
        handleSendLiveMessage,
        handleDeleteLiveMessage
    };
}