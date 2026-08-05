"use client";

import React, { useState, useMemo, ReactNode } from "react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Dropdown } from "@/components/ui/Dropdown";
import { BirthdayConfig, CustomMessagePayload } from "@/features/birthdays/types";
import { BIRTHDAY_TEMPLATE_CONFIG } from "@/features/birthdays/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";

interface BirthdaysBodyProps {
    initialConfig: BirthdayConfig;
    guildId: string;
    onSave: (config: BirthdayConfig) => Promise<void>;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
}

export function BirthdaysBody({
    initialConfig,
    guildId,
    onSave,
    channelMap,
    roleMap,
}: BirthdaysBodyProps): ReactNode | null {
    const defaultConfig: BirthdayConfig = useMemo(() => {
        return initialConfig || {
            guild_id: guildId,
            enabled: false,
            channel_id: "",
            announcement_hour: 9,
            birthday_role_id: "",
            require_year: false,
            message_with_year: { format: "TEXT", content: "Happy {user.ordinal_age} Birthday, {user}! 🎉" },
            message_without_year: { format: "TEXT", content: "Happy Birthday, {user}! 🎉" },
        };
    }, [initialConfig, guildId]);

    const { config, isPending, isDirty, handleSave, handleCancel, handleChange, setIsEmpty } =
        useConfigForm<BirthdayConfig>({
            initialConfig: defaultConfig,
            onSave: async (updatedConfig) => {
                if (updatedConfig) {
                    await onSave(updatedConfig);
                }
            },
        });

    const [activeTab, setActiveTab] = useState<"withYear" | "withoutYear">("withYear");

    if (!config) return null;

    // Options for Channel & Role dropdowns
    const channelOptions = [
        { value: "", label: "Select a channel..." },
        ...Object.entries(channelMap).map(([id, name]) => ({ value: id, label: `#${name}` })),
    ];

    const roleOptions = [
        { value: "", label: "None (Disabled)" },
        ...Object.entries(roleMap).map(([id, name]) => ({ value: id, label: `@${name}` })),
    ];

    const hourOptions = Array.from({ length: 24 }, (_, i) => ({
        value: String(i),
        label: `${String(i).padStart(2, "0")}:00 ${i < 12 ? "AM" : "PM"}`,
    }));

    const currentMsg = activeTab === "withYear" ? config.messageWithYear : config.messageWithoutYear;

    const handleMsgChange = (updatedMsg: CustomMessagePayload): void => {
        if (activeTab === "withYear") {
            handleChange({ ...config, messageWithYear: updatedMsg });
        } else {
            handleChange({ ...config, messageWithoutYear: updatedMsg });
        }
    };

    // Form is valid if disabled OR if enabled and a channel is selected
    const isFormValid = !config.enabled || Boolean(config.channelId && config.channelId.trim() !== "");

    return (
        <div className="max-w-4xl mx-auto py-6 space-y-6">
            <div className="space-y-6">
                {/* Header / Plugin Toggle */}
                <div className={`flex items-center justify-between ${config.enabled ? "pb-4 border-b border-neutral-800" : ""}`}>
                    <div>
                        <h2 className="text-xl font-bold">Birthdays Module</h2>
                        <p className="text-sm text-neutral-400">Celebrate server members on their special day!</p>
                    </div>
                    <ToggleSwitch
                        checked={config.enabled}
                        onChange={(checked) => handleChange({ ...config, enabled: checked })}
                        text={config.enabled ? "Enabled" : "Disabled"}
                    />
                </div>

                {/* Hide settings and message editor if module is disabled */}
                {config.enabled && (
                    <>
                        {/* Main Settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium">Announce Channel</label>
                                <Dropdown
                                    options={channelOptions}
                                    value={config.channelId || ""}
                                    onChange={(val) => handleChange({ ...config, channelId: val })}
                                    className={!isFormValid ? "border-red-700 dark:border-red-300" : undefined}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium">Announcement Time (Server Timezone)</label>
                                <Dropdown
                                    options={hourOptions}
                                    value={String(config.announcementHour ?? 9)}
                                    onChange={(val) => handleChange({ ...config, announcementHour: Number(val) })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium">Birthday Role</label>
                                <Dropdown
                                    options={roleOptions}
                                    value={config.birthdayRoleId || ""}
                                    onChange={(val) => handleChange({ ...config, birthdayRoleId: val })}
                                />
                            </div>

                            <div className="space-y-2 flex items-end">
                                <div className="py-2">
                                    <ToggleSwitch
                                        checked={config.requireYear}
                                        onChange={(checked) => handleChange({ ...config, requireYear: checked })}
                                        text="Require Birth Year from Members"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Messages Editor */}
                        <div className="pt-4 border-t border-neutral-800 space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium">Birthday Messages</label>

                                {/* Tabs for Message Types */}
                                <div className="flex gap-2 p-1 bg-neutral-900 rounded border border-neutral-800">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("withYear")}
                                        className={`px-3 py-1 text-xs rounded transition ${
                                            activeTab === "withYear" ? "bg-neutral-700 font-medium text-white" : "text-neutral-400 hover:text-white"
                                        }`}
                                    >
                                        With Year Known
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("withoutYear")}
                                        className={`px-3 py-1 text-xs rounded transition ${
                                            activeTab === "withoutYear" ? "bg-neutral-700 font-medium text-white" : "text-neutral-400 hover:text-white"
                                        }`}
                                    >
                                        Without Year
                                    </button>
                                </div>
                            </div>

                            <MessageConfigEditor
                                key={activeTab}
                                config={{
                                    format: currentMsg?.format || "TEXT",
                                    content: currentMsg?.content || "",
                                    embed: currentMsg?.embed || {},
                                }}
                                onChange={(updated) => handleMsgChange({ ...currentMsg, ...updated })}
                                onEmbedChange={(embed) => handleMsgChange({ ...currentMsg, embed })}
                                embedTemplateConfig={BIRTHDAY_TEMPLATE_CONFIG}
                                setIsEmpty={setIsEmpty}
                                enableToggle={false}
                                noChannels={true}
                            />
                        </div>
                    </>
                )}
            </div>

            {isDirty && isFormValid && (
                <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}/>
            )}
        </div>
    );
}