"use client";

import React, { useMemo, useState } from "react";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { DeletedMessageLogViewer } from "@/components/Dashboards/MessageLogging/DeleteMessageLogViewer";
import { EditedMessageLogViewer } from "@/components/Dashboards/MessageLogging/EditMessageLogViewer";
import { MultiSelectViewer } from "@/components/MultiSelectViewer";
import { MessageLoggingConfig } from "@/types/db/config";
import { TextInput } from "@/components/Inputs/TextInput";
import { useConfigForm } from "@/hooks/useConfigForm";
import { DeletedMessage, EditedMessage } from "@/types/db/deletedEditedMessages";
import { TabItem, Tabs } from "@/components/Layout/Tabs";
import { InputLabel } from "@/components/Layout/InputLabel";

interface MessageLoggingBodyProps {
    messageLoggingConfig: MessageLoggingConfig;
    onSave: (messageConfig: MessageLoggingConfig) => Promise<void>;
    deletedMessagesHistory: DeletedMessage[];
    editedMessagesHistory: EditedMessage[];
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    fetchMoreDeletedAction: (guild_id: string, before_id: number) => Promise<DeletedMessage[]>;
    fetchMoreEditedAction: (guild_id: string, before_id: number) => Promise<EditedMessage[]>;
    guildId: string;
}

export function MessageLoggingBody({
    messageLoggingConfig,
    onSave,
    deletedMessagesHistory,
    editedMessagesHistory,
    channelMap,
    roleMap,
    fetchMoreDeletedAction,
    fetchMoreEditedAction,
    guildId,
}: MessageLoggingBodyProps) {
    const normalizedMessageLoggingConfig = useMemo(() => {
        return {
            ...messageLoggingConfig,
            ignored_channels: messageLoggingConfig.ignored_channels || [],
            ignored_roles: messageLoggingConfig.ignoredRoles || [],
            ignored_users: messageLoggingConfig.ignoredUsers || [],
            events: {
                messageDelete: messageLoggingConfig.events?.messageDelete ?? false,
                messageEdit: messageLoggingConfig.events?.messageEdit ?? false,
            },
        };
    }, [messageLoggingConfig]);

    const {
        config,
        isPending,
        isDirty,
        handleSave,
        handleCancel: resetConfig,
        handleChange,
    } = useConfigForm({
        initialConfig: normalizedMessageLoggingConfig,
        onSave,
    });

    const [userIdInput, setUserIdInput] = useState("");
    const [activeTab, setActiveTab] = useState<"settings" | "logs">("settings");

    // Derived State: Feature is enabled if AT LEAST ONE event is toggled on!
    const isLoggingEnabled = config.events.messageDelete || config.events.messageEdit;

    const handleCancel = () => {
        resetConfig();
        setUserIdInput("");
    };

    const handleAddUserId = () => {
        const trimmed = userIdInput.trim();
        if (!trimmed) return;

        if (!/^\d+$/.test(trimmed)) {
            alert("Please enter a valid Discord User ID.");
            return;
        }

        const current = config.ignored_users || [];
        if (!current.includes(trimmed)) {
            handleChange({ ...config, ignored_users: [...current, trimmed] });
        }
        setUserIdInput("");
    };

    const handleRemoveUserId = (id: string) => {
        const current = config.ignored_users || [];
        handleChange({ ...config, ignored_users: current.filter((item) => item !== id) });
    };

    // Memoize options for Dropdowns
    const channelOptions = useMemo(
        () =>
            Object.entries(channelMap).map(([id, name]) => ({
                value: id,
                label: `#${name}`,
            })),
        [channelMap]
    );

    const roleOptions = useMemo(
        () =>
            Object.entries(roleMap).map(([id, name]) => ({
                value: id,
                label: `@${name.replace("@", "")}`,
            })),
        [roleMap]
    );

    const tabs: TabItem<"settings" | "logs">[] = [
        { value: "settings", label: "Settings" },
        { value: "logs", label: "Logs" },
    ];

    return (
        <div className="space-y-4">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={(t) => setActiveTab(t)}/>

            {activeTab === "settings" && (
                <div className="space-y-2">
                    <div className="space-y-2">
                        <div className="space-y-1">
                            <ToggleSwitch
                                checked={config.events.messageDelete} onChange={(checked) =>
                                handleChange({
                                    ...config,
                                    events: { ...config.events, messageDelete: checked },
                                })
                            } text="Log Deleted Messages"
                            />
                            <ToggleSwitch
                                checked={config.events.messageEdit} onChange={(checked) =>
                                handleChange({
                                    ...config,
                                    events: { ...config.events, messageEdit: checked },
                                })
                            } text="Log Edited Messages"
                            />
                        </div>
                    </div>

                    {isLoggingEnabled && (
                        <div>
                            <h4 className="text-2xl font-semibold">Exclusion Rules</h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <InputLabel>Ignored Channels</InputLabel>
                                    <Dropdown
                                        multiple
                                        options={channelOptions}
                                        value={config.ignored_channels}
                                        onChange={(selectedValues: string[]) =>
                                            handleChange({ ...config, ignored_channels: selectedValues })
                                        }
                                        placeholder="Select channels to ignore..."
                                    />
                                </div>

                                {/* Ignored Roles */}
                                <div className="space-y-2">
                                    <InputLabel>Ignored Roles</InputLabel>
                                    <Dropdown
                                        multiple
                                        options={roleOptions}
                                        value={config.ignored_roles}
                                        onChange={(selectedValues: string[]) =>
                                            handleChange({ ...config, ignored_roles: selectedValues })
                                        }
                                        placeholder="Select roles to ignore..."
                                    />
                                </div>

                                {/* Ignored User IDs */}
                                <div className="space-y-2">
                                    <InputLabel>Ignored User IDs</InputLabel>
                                    <MultiSelectViewer
                                        selectedList={config.ignored_users}
                                        onDelete={handleRemoveUserId}
                                        placeholder="No users ignored"
                                    />
                                    <TextInput
                                        onSubmit={handleAddUserId}
                                        value={userIdInput}
                                        onChange={(e) => setUserIdInput(e.target.value)}
                                        placeholder="Type User ID & press Enter"
                                        parentClassName="max-w-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "logs" && isLoggingEnabled && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {config.events.messageDelete && (
                        <DeletedMessageLogViewer
                            sseUrl={`http://localhost:8080/api/sse/events?guild_id=${guildId}`}
                            initialHistory={deletedMessagesHistory}
                            channelMap={channelMap}
                            guildId={guildId}
                            fetchMoreAction={fetchMoreDeletedAction}
                        />
                    )}

                    {config.events.messageEdit && (
                        <EditedMessageLogViewer
                            sseUrl={`http://localhost:8080/api/sse/events?guild_id=${guildId}`}
                            initialHistory={editedMessagesHistory}
                            channelMap={channelMap}
                            guildId={guildId}
                            fetchMoreAction={fetchMoreEditedAction}
                        />
                    )}
                </div>
            )}

            {/* Save Popup */}
            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}