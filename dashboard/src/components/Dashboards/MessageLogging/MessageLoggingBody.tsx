"use client";

import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { Dropdown } from "@/components/Inputs/Dropdown";
import React, { useMemo, useState } from "react";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { DeletedMessageLogViewer } from "@/components/Dashboards/MessageLogging/DeleteMessageLogViewer";
import { EditedMessageLogViewer } from "@/components/Dashboards/MessageLogging/EditMessageLogViewer";
import { MultiSelectViewer } from "@/components/MultiSelectViewer";
import { MessageLoggingConfig } from "@/types/db/config";
import { TextInput } from "@/components/Inputs/TextInput";
import { useConfigForm } from "@/hooks/useConfigForm";
import { DeletedMessage, EditedMessage } from "@/types/db/deletedEditedMessages";
import { IgnoredSelection } from "@/types";

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
    const [channelDropdownValue, setChannelDropdownValue] = useState("");
    const [roleDropdownValue, setRoleDropdownValue] = useState("");

    const handleCancel = () => {
        resetConfig();
        setUserIdInput("");
    };

    const toggleSelection = (key: IgnoredSelection, id: string) => {
        const TAB_TO_DB_KEY = {
            IGNORED_CHANNELS: "ignored_channels",
            IGNORED_ROLES: "ignored_roles",
        } as const;

        const current = config[TAB_TO_DB_KEY[key]] || [];
        const updated = current.includes(id)
            ? current.filter((item) => item !== id)
            : [...current, id];
        handleChange({ ...config, [key]: updated });
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

    const showViewers = config.enabled && (config.events?.messageDelete || config.events?.messageEdit);

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <ToggleSwitch
                    checked={config.enabled}
                    onChange={(checked) => handleChange({ ...config, enabled: checked })}
                    disabled={false}
                    text="Enable Message Logging"
                />

                {config.enabled && (
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold uppercase tracking-wider">Logging Events</h4>
                            <ToggleSwitch
                                checked={config.events.messageDelete} onChange={(checked) => handleChange({
                                ...config,
                                events: { ...config.events, messageDelete: checked }
                            })} disabled={false} text="Log Deleted Messages"
                            />
                            <ToggleSwitch
                                checked={config.events.messageEdit} onChange={(checked) => handleChange({
                                ...config,
                                events: { ...config.events, messageEdit: checked }
                            })} disabled={false} text="Log Edited Messages"
                            />
                        </div>

                        <div className="space-y-6 pt-4 border-t">
                            <h4 className="text-sm font-semibold uppercase tracking-wider mb-2">Exclusion Rules</h4>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium">Ignored Channels</label>
                                <MultiSelectViewer
                                    selectedList={config.ignored_channels}
                                    onDelete={(id) => toggleSelection("IGNORED_CHANNELS", id)}
                                    map={channelMap}
                                    placeholder="No channels ignored"
                                    prefix="#"
                                />
                                <Dropdown
                                    options={Object.entries(channelMap)
                                        .filter(([id]) => !(config.ignored_channels || []).includes(id))
                                        .map(([id, name]) => ({ value: id, label: `#${name}` }))}
                                    value={channelDropdownValue}
                                    onChange={(val) => {
                                        if (val) toggleSelection("IGNORED_CHANNELS", val);
                                        setChannelDropdownValue("");
                                    }}
                                    placeholder="Choose a channel to ignore..."
                                    className="max-w-xs"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium">Ignored Roles</label>
                                <MultiSelectViewer
                                    selectedList={config.ignored_roles}
                                    onDelete={(id) => toggleSelection("IGNORED_ROLES", id)}
                                    map={roleMap}
                                    placeholder="No roles ignored"
                                    prefix="@"
                                />
                                <Dropdown
                                    options={Object.entries(roleMap)
                                        .filter(([id]) => !(config.ignored_roles || []).includes(id))
                                        .map(([id, name]) => ({ value: id, label: `@${name.replace("@", "")}` }))}
                                    value={roleDropdownValue}
                                    onChange={(val) => {
                                        if (val) toggleSelection("IGNORED_ROLES", val);
                                        setRoleDropdownValue("");
                                    }}
                                    placeholder="Choose a role to ignore..."
                                    className="max-w-xs"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium">Ignored User IDs</label>
                                <MultiSelectViewer
                                    selectedList={config.ignored_users}
                                    onDelete={(id) => handleRemoveUserId(id)}
                                    placeholder="No user ignored"
                                />
                                <TextInput
                                    onSubmit={handleAddUserId}
                                    value={userIdInput}
                                    onChange={(e) => setUserIdInput(e.target.value)}
                                    placeholder="Type a User ID"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showViewers && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 items-start">
                    {config.events?.messageDelete && (
                        <DeletedMessageLogViewer
                            sseUrl={`http://localhost:8080/api/sse/events?guild_id=${guildId}`}
                            initialHistory={deletedMessagesHistory}
                            channelMap={channelMap}
                            guildId={guildId}
                            fetchMoreAction={fetchMoreDeletedAction}
                        />
                    )}

                    {config.events?.messageEdit && (
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

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}