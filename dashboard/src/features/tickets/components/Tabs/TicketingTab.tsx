// features/tickets/components/Tabs/TicketingTab.tsx

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
import { isDeepEqual } from "@/features/_shared/embed";

type MessageConfigWithChannel = GenericMessageConfig & { channel_id?: string };

interface TicketingTabProps {
    config: TicketConfig;
    setConfig: Dispatch<SetStateAction<TicketConfig>>;
    channels: DiscordChannel[];
    disabled: boolean;
    categoryMap: Record<string, string>;
    roleMap: Record<string, string>;
    onDeletePanel: () => Promise<void>;
    onPostPanel: () => Promise<void>;
    isProcessing: boolean;
    isDirty: boolean;
    status: { type: "SUCCESS" | "ERROR"; message: string } | null;
}

export default function TicketingTab({
    config,
    setConfig,
    channels,
    disabled,
    categoryMap,
    roleMap,
    onDeletePanel,
    onPostPanel,
    isProcessing,
    isDirty,
    status,
}: TicketingTabProps) {
    // Check missing fields directly on honest state (null / empty)
    const targetCategoryIsEmpty = !config.categoryId;
    const targetRoleIsEmpty = !config.ticketRoleId;
    const targetChannelIsEmpty = !config.channelId;

    const panelMessageConfig = useMemo<GenericMessageConfig>(() => ({
        ...config.panelMessage,
        enabled: config.enabled ?? config.panelMessage?.enabled ?? false,
        channel_id: config.channelId,
    }), [config.panelMessage, config.enabled, config.channelId]);

    const handlePanelMessageChange = useCallback((updated: GenericMessageConfig) => {
        setConfig((prev) => {
            const nextEnabled = updated.enabled ?? prev.enabled;
            const nextChannelId = updated.channel_id ?? null;
            const nextFormat = updated.format ?? "TEXT";
            const nextContent = updated.content ?? "";
            const nextEmbed = updated.embed ?? {};

            if (
                prev.enabled === nextEnabled &&
                prev.channelId === nextChannelId &&
                prev.panelMessage.enabled === nextEnabled &&
                prev.panelMessage.format === nextFormat &&
                prev.panelMessage.content === nextContent &&
                isDeepEqual(prev.panelMessage.embed, nextEmbed)
            ) {
                return prev;
            }

            return {
                ...prev,
                enabled: nextEnabled,
                channelId: nextChannelId,
                panelMessage: {
                    enabled: nextEnabled,
                    format: nextFormat,
                    content: nextContent,
                    embed: nextEmbed,
                },
            };
        });
    }, [setConfig]);

    const handleCategoryChange = useCallback((v: string | null) => {
        setConfig((prev) => ({ ...prev, categoryId: v }));
    }, [setConfig]);

    const handleRoleChange = useCallback((v: string | null) => {
        setConfig((prev) => ({ ...prev, ticketRoleId: v }));
    }, [setConfig]);

    const categoryOptions = useMemo(() => getAvailableCategoryOptions(categoryMap), [categoryMap]);
    const roleOptions = useMemo(() => getAvailableRoleOptions(roleMap), [roleMap]);

    const actionButtonDisabled =
        isDirty ||
        isProcessing ||
        !config.enabled ||
        !config.channelId ||
        targetChannelIsEmpty ||
        targetCategoryIsEmpty ||
        targetRoleIsEmpty;

    return (
        <div className="flex flex-col">
            <MessageConfigEditor
                config={panelMessageConfig}
                onChange={handlePanelMessageChange}
                channels={channels}
                disabled={disabled}
                toggleLabel="Enable Interactive Ticket System"
                embedTemplateConfig={TICKETS_PANEL_CONFIG}
                modeLabel="Message Mode (Tickets Panel)"
                placeholderText="Click the button below to open a support ticket."
                setIsEmpty={() => {}} // Dummy no-op if MessageConfigEditor still demands it
                customFields={
                    <div className="max-w-md flex flex-col">
                        <div>
                            <InputLabel required>Ticket Destination Category</InputLabel>
                            <Dropdown
                                value={config.categoryId}
                                onChange={handleCategoryChange}
                                options={categoryOptions}
                                error={targetCategoryIsEmpty && config.enabled}
                            />
                            {targetCategoryIsEmpty && config.enabled && (
                                <p className="text-xs text-danger mt-1">
                                    Please select a Discord Category for tickets.
                                </p>
                            )}
                        </div>

                        <div>
                            <InputLabel required>Support Staff Role</InputLabel>
                            <Dropdown
                                value={config.ticketRoleId}
                                onChange={handleRoleChange}
                                options={roleOptions}
                                error={targetRoleIsEmpty && config.enabled}
                            />
                            {targetRoleIsEmpty && config.enabled && (
                                <p className="text-xs text-danger mt-1">
                                    Please select a Support Staff Role.
                                </p>
                            )}
                        </div>
                    </div>
                }
            />

            {config.enabled && (
                <div className="flex flex-col gap-4 mt-6">
                    <div>
                        <Emphasis>Post Ticket Panel</Emphasis>
                        <p className="text-sm text-subtle">
                            Send or delete your saved custom embed and/or text content down to the selected Discord channel.
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
                        <p className={`text-sm ${status.type === "SUCCESS" ? "text-success" : "text-danger"}`}>
                            {status.message}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}