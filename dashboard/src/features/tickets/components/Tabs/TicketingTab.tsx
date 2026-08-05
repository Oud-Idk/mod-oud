import { Dispatch, SetStateAction, useCallback, useMemo } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { TicketConfig } from "@/features/tickets/types";
import { TICKETS_PANEL_CONFIG } from "@/features/tickets/builderConfigs";

import { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordChannel } from "@/features/_shared/channels.types";

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
    status: { type: "SUCCESS" | "ERROR"; message: string } | null,
    isEmpty: boolean,
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
        const transformedArray = Object.entries(categoryMap).map(([key, value]) => ({
            value: key,
            label: value
        }));
        return [{ value: "", label: "Select a category for tickets..." }, ...transformedArray];
    }, [categoryMap]);

    const roleOptions = useMemo(() => {
        const transformedArray = Object.entries(roleMap).map(([key, value]) => ({
            value: key,
            label: value
        }));
        return [{ value: "", label: "Select a support role..." }, ...transformedArray];
    }, [roleMap]);

    const actionButtonDisabled = !(!isDirty && config.channelId && config.enabled && !targetChannelIsEmpty && !isEmpty);

    return (
        <div className="flex flex-col gap-3 mt-4">
            <MessageConfigEditor
                config={config}
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
                    <div className="max-w-sm space-y-3">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium">Ticket Destination Category</label>
                            <Dropdown
                                value={(config.categoryId ?? "")}
                                onChange={handleCategoryChange}
                                options={categoryOptions}
                                className={targetCategoryIsEmpty ? `border-red-700 dark:border-red-300` : ''}
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium">Support Staff Role</label>
                            <Dropdown
                                value={config.ticketRoleId || ""}
                                onChange={handleRoleChange}
                                options={roleOptions}
                                className={targetRoleIsEmpty ? `border-red-700 dark:border-red-300` : ''}
                            />
                        </div>
                    </div>
                }
            />

            {config.enabled && (
                <div className="flex flex-col  gap-4">
                    <div>
                        <h3 className="text-lg font-medium">Post Ticket Panel</h3>
                        <p className="text-sm">
                            Send or delete your saved custom embed and/or text content down to the selected Discord
                            channel. </p>
                    </div>
                    {config.postedMessageId ? (
                        <button
                            onClick={onDeletePanel}
                            disabled={actionButtonDisabled}
                            className="w-fit px-4 py-2 text-sm font-medium border border-red-500 rounded hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {isProcessing ? "Deleting Panel..." : "Delete Ticket Panel"}
                        </button>
                    ) : (
                        <button
                            onClick={onPostPanel}
                            disabled={actionButtonDisabled}
                            className="w-fit px-4 py-2 text-sm font-medium border border-neutral-500 rounded hover:bg-neutral-300/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {isProcessing ? "Sending Panel..." : "Post Ticket Panel"}
                        </button>
                    )}

                    {isDirty && (
                        <span className="text-sm text-amber-600 italic">
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