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
    const [channelDropdownValue, setChannelDropdownValue] = useState("");
    const [roleDropdownValue, setRoleDropdownValue] = useState("");
    const [activeTab, setActiveTab] = useState<"settings" | "logs">("settings");

    // Derived State: Feature is enabled if AT LEAST ONE event is toggled on!
    const isLoggingEnabled = config.events.messageDelete || config.events.messageEdit;

    const handleCancel = () => {
        resetConfig();
        setUserIdInput("");
    };

    // Helper for updating arrays (Channels / Roles)
    const toggleIgnoredItem = (key: "ignored_channels" | "ignored_roles", id: string) => {
        const current = config[key] || [];
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

    return (
        <div className="space-y-6">
            {/* Top Bar: Tabs for Settings vs Live Feed */}
            <div className="flex items-center justify-between border-b pb-3">
                <div className="flex gap-4">
                    <button
                        onClick={() => setActiveTab("settings")}
                        className={`text-sm font-semibold pb-1 border-b-2 transition-all ${
                            activeTab === "settings"
                                ? "border-primary text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Logging Settings
                    </button>
                    {isLoggingEnabled && (
                        <button
                            onClick={() => setActiveTab("logs")}
                            className={`text-sm font-semibold pb-1 border-b-2 transition-all ${
                                activeTab === "logs"
                                    ? "border-primary text-foreground"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Live Log Stream </button>
                    )}
                </div>

                <div className="text-xs text-muted-foreground">
                    Status: {isLoggingEnabled ? "🟢 Active" : "🔴 Disabled"}
                </div>
            </div>

            {/* TAB 1: SETTINGS */}
            {activeTab === "settings" && (
                <div className="space-y-8">
                    {/* Event Toggles */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                            Events to Log </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                    {/* Exclusion Rules (Only show if at least 1 event is enabled) */}
                    {isLoggingEnabled ? (
                        <div className="space-y-6 pt-6 border-t">
                            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                Exclusion Rules </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* Ignored Channels */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium">Ignored Channels</label>
                                    <MultiSelectViewer
                                        selectedList={config.ignored_channels}
                                        onDelete={(id) => toggleIgnoredItem("ignored_channels", id)}
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
                                            if (val) toggleIgnoredItem("ignored_channels", val);
                                            setChannelDropdownValue("");
                                        }}
                                        placeholder="Ignore a channel..."
                                    />
                                </div>

                                {/* Ignored Roles */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium">Ignored Roles</label>
                                    <MultiSelectViewer
                                        selectedList={config.ignored_roles}
                                        onDelete={(id) => toggleIgnoredItem("ignored_roles", id)}
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
                                            if (val) toggleIgnoredItem("ignored_roles", val);
                                            setRoleDropdownValue("");
                                        }}
                                        placeholder="Ignore a role..."
                                    />
                                </div>

                                {/* Ignored User IDs */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium">Ignored User IDs</label>
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
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 rounded-md bg-muted/50 text-muted-foreground text-sm">
                            Enable at least one event above to configure exclusion rules and view logs. </div>
                    )}
                </div>
            )}

            {/* TAB 2: LIVE LOG STREAM */}
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