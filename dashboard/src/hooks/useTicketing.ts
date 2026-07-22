import { TicketConfig } from "@/types/db/config";
import { useCallback, useState } from "react";
import { isDeepEqual } from "@/utils/embed";
import { Format } from "@/types/db";
import { Status } from "@/types";

export function useTicketing(
    config: TicketConfig,
    ticketConfig: TicketConfig,
    isEmpty: boolean,
    targetChannelIsEmpty: boolean,
    hookHandleSave: () => void,
    hookHandleCancel: () => void,
    setConfig: (value: TicketConfig | ((prevState: TicketConfig) => TicketConfig)) => void,
    onSendTicketMessage: (channelId: string) => Promise<string | void>,
    onDeleteTicketMessage: (channelId: string, messageId: string) => Promise<void>
) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState<{ type: Status; message: string } | null>(null);
    const [isWelcomeEmpty, setIsWelcomeEmpty] = useState(false);

    // Kept in parent because they are required to compute isDirty for SavePopup
    const targetCategoryIsEmpty = config.categoryId.trim() === "";
    const targetRoleIsEmpty = !config.ticketRoleId || config.ticketRoleId.trim() === "";
    const isWarnThresholdInvalid = config.warnThreshold > config.deleteThreshold;

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
            welcomeMessage: {
                format: updated.format as Format,
                content: updated.content,
                embed: updated.embed,
                enabled: updated.enabled
            }
        }));
    }, [setConfig]);

    const handleWelcomeEmbedChange = useCallback((embed: any) => {
        setConfig((prev) => ({
            ...prev,
            welcomeMessage: {
                format: prev.welcomeMessage?.format ?? "EMBED",
                content: prev.welcomeMessage?.content ?? "",
                embed: embed,
                enabled: prev.welcomeMessage?.enabled
            }
        }));
    }, [setConfig]);

    const handleTicketConfigChange = useCallback((updated: TicketConfig) => {
        setConfig(updated);
    }, [setConfig]);

    const handleSendLiveMessage = async () => {
        if (!config.channelId) return;
        setIsProcessing(true);
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
            setIsProcessing(false);
        }
    };

    const handleDeleteLiveMessage = async () => {
        if (!config.channelId || !config.postedMessageId) return;
        setIsProcessing(true);
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
        handleTicketConfigChange, // Returning the shiny new unified handler!
        handleSendLiveMessage,
        handleDeleteLiveMessage
    };
}