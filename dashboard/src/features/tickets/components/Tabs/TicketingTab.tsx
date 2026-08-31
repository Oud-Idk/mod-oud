// features/tickets/components/Tabs/TicketingTab.tsx

import { Dispatch, JSX, SetStateAction, useCallback, useMemo } from "react";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { TicketConfig } from "@/features/tickets/types";
import { TICKETS_PANEL_CONFIG } from "@/features/tickets/builderConfigs";
import { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordChannel } from "@/features/_shared/channels.types";
import { InputLabel } from "@/components/layout/InputLabel";
import Emphasis from "@/components/layout/Emphasis";
import { Button } from "@/components/ui/inputs/Button";
import { getAvailableCategoryOptions, getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { isDeepEqual } from "@/features/_shared/embed";

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
}: TicketingTabProps): JSX.Element {
    const targetCategoryIsEmpty = config.categoryId === null;
    const targetRoleIsEmpty = config.ticketRoleId === null;
    const targetChannelIsEmpty = config.channelId === null;

    const panelMessageConfig = useMemo<GenericMessageConfig>(() => ({
        format: config.panelMessage.message.format,
        content: config.panelMessage.message.content,
        embed: config.panelMessage.message.embed,
        enabled: config.enabled,
        channel_id: config.channelId,
    }), [config.panelMessage, config.enabled, config.channelId]);

    const handlePanelMessageChange = useCallback((updated: GenericMessageConfig) => {
        setConfig((prev) => {
            const nextEnabled = updated.enabled ?? prev.enabled;
            const nextChannelId = updated.channel_id ?? null;
            const nextFormat = updated.format;
            const nextContent = updated.content ?? "";
            const nextEmbed = updated.embed ?? {};

            if (
                prev.enabled === nextEnabled &&
                prev.channelId === nextChannelId &&
                prev.panelMessage.enabled === nextEnabled &&
                prev.panelMessage.message.format === nextFormat &&
                prev.panelMessage.message.content === nextContent &&
                isDeepEqual(prev.panelMessage.message.embed, nextEmbed)
            ) {
                return prev;
            }

            return {
                ...prev,
                enabled: nextEnabled,
                channelId: nextChannelId,
                panelMessage: {
                    enabled: nextEnabled,
                    message: {
                        format: nextFormat,
                        content: nextContent,
                        embed: nextEmbed,
                    },
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
        config.channelId === null ||
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

                    {config.postedMessageId !== null ? (
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
                </div>
            )}
        </div>
    );
}