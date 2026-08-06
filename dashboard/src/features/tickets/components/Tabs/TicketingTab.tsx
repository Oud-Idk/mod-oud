import { Dispatch, SetStateAction, useCallback, useMemo } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { TicketConfig } from "@/features/tickets/types";
import { TICKETS_PANEL_CONFIG } from "@/features/tickets/builderConfigs";

import { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordChannel } from "@/features/_shared/channels.types";
import { InputLabel } from "@/components/layout/InputLabel";
import Emphasis from "@/components/layout/Emphasis";
import { Button } from "@/components/ui/Button";
import { getAvailableCategoryOptions, getAvailableRoleOptions } from "@/features/_shared/dropdown";

interface TicketingTabProps {
    config: TicketConfig;
    setConfig: Dispatch<SetStateAction<TicketConfig>>;
    channels: DiscordChannel[];
    disabled: boolean;
    resetKey: number;
    setIsEmpty: Dispatch<SetStateAction<boolean>>;
    targetChannelIsEmpty: boolean;
    setTargetChannelIsEmpty: Dispatch<SetStateAction<boolean>>;
    categoryMap: Record<string, string>;
    roleMap: Record<string, string>;
    onDeletePanel: () => Promise<void>;
    onPostPanel: () => Promise<void>;
    isProcessing: boolean;
    isDirty: boolean;
    status: { type: "SUCCESS" | "ERROR"; message: string } | null;
    isEmpty: boolean;
}

export default function TicketingTab({
    config,
    setConfig,
    channels,
    disabled,
    resetKey,
    setIsEmpty,
    targetChannelIsEmpty,
    setTargetChannelIsEmpty,
    categoryMap,
    roleMap,
    onDeletePanel,
    onPostPanel,
    isProcessing,
    isDirty,
    status,
    isEmpty,
}: TicketingTabProps) {
    const targetCategoryIsEmpty = (config.categoryId ?? "").trim() === "";
    const targetRoleIsEmpty = !config.ticketRoleId || config.ticketRoleId.trim() === "";

    const messageConfigAdapter = useMemo<GenericMessageConfig>(() => ({
        enabled: config.enabled,
        channel_id: config.channelId,
        content: config.content,
        embed: config.embed,
        format: config.format,
    }), [config]);

    const handleChange = useCallback((updated: GenericMessageConfig) => {
        setConfig((prev) => ({
            ...prev,
            enabled: updated.enabled ?? false,
            channelId: updated.channel_id ?? "",
            content: updated.content ?? "",
            embed: updated.embed ?? {},
            format: updated.format,
        }));
    }, [setConfig]);

    const handleEmbedChange = useCallback((embed: any) => {
        setConfig((prev) => ({ ...prev, embed }));
    }, [setConfig]);

    const handleCategoryChange = useCallback((v: string) => {
        setConfig((prev) => ({ ...prev, categoryId: v }));
    }, [setConfig]);

    const handleRoleChange = useCallback((v: string) => {
        setConfig((prev) => ({ ...prev, ticketRoleId: v }));
    }, [setConfig]);

    const categoryOptions = useMemo(() => {
        return getAvailableCategoryOptions(categoryMap);
    }, [categoryMap]);

    const roleOptions = useMemo(() => {
        return getAvailableRoleOptions(roleMap);
    }, [roleMap]);

    const actionButtonDisabled =
        isDirty ||
        isProcessing ||
        !config.enabled ||
        !config.channelId ||
        targetChannelIsEmpty ||
        targetCategoryIsEmpty ||
        targetRoleIsEmpty ||
        isEmpty;

    return (
        <div className="flex flex-col">
            <MessageConfigEditor
                config={messageConfigAdapter}
                onChange={handleChange}
                onEmbedChange={handleEmbedChange}
                channels={channels}
                disabled={disabled}
                toggleLabel="Enable Interactive Ticket System"
                embedTemplateConfig={TICKETS_PANEL_CONFIG}
                resetKey={`${resetKey}_tickets`}
                modeLabel="Message Mode (Tickets Panel)"
                placeholderText="Click the button below to open a support ticket."
                setIsEmpty={setIsEmpty}
                targetChannelIsEmpty={targetChannelIsEmpty}
                setTargetChannelIsEmpty={setTargetChannelIsEmpty}
                customFields={
                    <div className="max-w-md flex flex-col">
                        <div>
                            <InputLabel required>Ticket Destination Category</InputLabel>
                            <Dropdown
                                value={(config.categoryId ?? "")}
                                onChange={handleCategoryChange}
                                options={categoryOptions}
                                error={targetCategoryIsEmpty}
                            />
                            {targetCategoryIsEmpty && (
                                <p className="text-xs text-danger mt-1">
                                    Please select a category for tickets.
                                </p>
                            )}
                        </div>

                        <div>
                            <InputLabel required>Support Staff Role</InputLabel>
                            <Dropdown
                                value={config.ticketRoleId ?? ""}
                                onChange={handleRoleChange}
                                options={roleOptions}
                                error={targetRoleIsEmpty}
                            />
                            {targetRoleIsEmpty && (
                                <p className="text-xs text-danger mt-1">
                                    Please select a support staff role.
                                </p>
                            )}
                        </div>
                    </div>
                }
            />

            {config.enabled && (
                <div className="flex flex-col gap-4">
                    <div>
                        <Emphasis className="mt-4">Post Ticket Panel</Emphasis>
                        <p className="text-sm">
                            Send or delete your saved custom embed and/or text content down to the selected Discord
                            channel.
                        </p>
                    </div>
                    {config.postedMessageId ? (
                        <Button
                            variant="danger"
                            onClick={onDeletePanel}
                            disabled={actionButtonDisabled}
                            className="w-fit"
                        >
                            {isProcessing ? "Deleting Panel..." : "Delete Ticket Panel"}
                        </Button>
                    ) : (
                        <Button
                            onClick={onPostPanel}
                            disabled={actionButtonDisabled}
                            className="w-fit"
                        >
                            {isProcessing ? "Sending Panel..." : "Post Ticket Panel"}
                        </Button>
                    )}

                    {isDirty && (
                        <span className="text-sm text-warning italic">
                            Please save your changes first to enable actions.
                        </span>
                    )}

                    {status && (
                        <p className={`text-sm ${status.type === "SUCCESS" ? "text-green-600" : "text-red-600"}`}>
                            {status.message}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}