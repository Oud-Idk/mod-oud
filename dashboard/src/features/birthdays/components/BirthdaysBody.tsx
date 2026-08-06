"use client";

import React, { useState, useMemo, ReactNode } from "react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Dropdown } from "@/components/ui/Dropdown";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BirthdayConfig, CustomMessagePayload } from "@/features/birthdays/types";
import { BIRTHDAY_TEMPLATE_CONFIG } from "@/features/birthdays/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { InputLabel } from "@/components/layout/InputLabel";

interface BirthdaysBodyProps {
    initialConfig: BirthdayConfig;
    guildId: string;
    onSave: (config: BirthdayConfig) => Promise<void>;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
}

const COMMON_TIMEZONES = [
    { value: "UTC", label: "(UTC+00:00) UTC" },
    { value: "America/New_York", label: "(UTC-05:00) Eastern Time (US & Canada)" },
    { value: "America/Chicago", label: "(UTC-06:00) Central Time (US & Canada)" },
    { value: "America/Denver", label: "(UTC-07:00) Mountain Time (US & Canada)" },
    { value: "America/Los_Angeles", label: "(UTC-08:00) Pacific Time (US & Canada)" },
    { value: "America/Anchorage", label: "(UTC-09:00) Alaska" },
    { value: "Pacific/Honolulu", label: "(UTC-10:00) Hawaii" },
    { value: "Europe/London", label: "(UTC+00:00) London, Dublin, Edinburgh" },
    { value: "Europe/Paris", label: "(UTC+01:00) Paris, Berlin, Rome, Madrid" },
    { value: "Europe/Athens", label: "(UTC+02:00) Athens, Istanbul, Helsinki" },
    { value: "Europe/Moscow", label: "(UTC+03:00) Moscow, St. Petersburg" },
    { value: "Asia/Dubai", label: "(UTC+04:00) Dubai, Abu Dhabi" },
    { value: "Asia/Kolkata", label: "(UTC+05:30) India, New Delhi" },
    { value: "Asia/Bangkok", label: "(UTC+07:00) Bangkok, Hanoi, Jakarta" },
    { value: "Asia/Singapore", label: "(UTC+08:00) Singapore, Beijing, Hong Kong" },
    { value: "Asia/Tokyo", label: "(UTC+09:00) Tokyo, Seoul" },
    { value: "Australia/Sydney", label: "(UTC+10:00) Sydney, Melbourne" },
    { value: "Pacific/Auckland", label: "(UTC+12:00) Auckland, Wellington" },
];

export function BirthdaysBody({
    initialConfig,
    guildId,
    onSave,
    channelMap,
    roleMap,
}: BirthdaysBodyProps): ReactNode | null {
    // Detect browser's timezone automatically
    const browserTz = useMemo(() => {
        if (typeof window !== "undefined") {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        }
        return "UTC";
    }, []);

    // Add detected browser timezone to options if not already listed
    const timezoneOptions = useMemo(() => {
        const list = [...COMMON_TIMEZONES];
        if (browserTz && !list.some((tz) => tz.value === browserTz)) {
            list.unshift({ value: browserTz, label: `Detected (${browserTz})` });
        }
        return list;
    }, [browserTz]);

    const defaultConfig: BirthdayConfig = useMemo(() => {
        return (
            initialConfig || {
                guild_id: guildId,
                enabled: false,
                channel_id: "",
                announcement_hour: 9,
                timezone: browserTz,
                birthday_role_id: "",
                require_year: false,
                message_with_year: { format: "TEXT", content: "Happy {user.ordinal_age} Birthday, {user}! 🎉" },
                message_without_year: { format: "TEXT", content: "Happy Birthday, {user}! 🎉" },
            }
        );
    }, [initialConfig, guildId, browserTz]);

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

    const channelOptions = [
        { value: "", label: "Select a channel..." },
        ...Object.entries(channelMap).map(([id, name]) => ({ value: id, label: `#${name}` })),
    ];

    const roleOptions = [
        { value: "", label: "None (Disabled)" },
        ...Object.entries(roleMap).map(([id, name]) => ({ value: id, label: `@${name}` })),
    ];

    const hourOptions = Array.from({ length: 24 }, (_, i) => {
        const formattedHour = String(i % 12 || 12).padStart(2, "0");
        const period = i < 12 ? "AM" : "PM";
        return {
            value: String(i),
            label: `${formattedHour}:00 ${period}`,
        };
    });

    const currentMsg = activeTab === "withYear" ? config.messageWithYear : config.messageWithoutYear;

    const handleMsgChange = (updatedMsg: CustomMessagePayload): void => {
        if (activeTab === "withYear") {
            handleChange({ ...config, messageWithYear: updatedMsg });
        } else {
            handleChange({ ...config, messageWithoutYear: updatedMsg });
        }
    };

    // Validation checks
    const isChannelMissing = config.enabled && (!config.channelId || config.channelId.trim() === "");
    const isFormValid = !config.enabled || !isChannelMissing;

    return (
        <div className="space-y-6">
            <ToggleSwitch
                checked={config.enabled}
                onChange={(checked) => handleChange({ ...config, enabled: checked })}
                text="Enable Birthday Tracking"
            />

            {config.enabled && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <InputLabel>
                                Announce Channel <span className="text-danger">*</span>
                            </InputLabel>
                            <Dropdown
                                options={channelOptions}
                                value={config.channelId || ""}
                                onChange={(val) => handleChange({ ...config, channelId: val })}
                                error={isChannelMissing}
                            />
                            {isChannelMissing && (
                                <p className="text-xs text-danger mt-1.5 font-medium">
                                    Please select an announcement channel.
                                </p>
                            )}
                        </div>

                        <div>
                            <InputLabel>Birthday Role</InputLabel>
                            <Dropdown
                                options={roleOptions}
                                value={config.birthdayRoleId || ""}
                                onChange={(val) => handleChange({ ...config, birthdayRoleId: val })}
                            />
                        </div>

                        <div>
                            <InputLabel>Announcement Time</InputLabel>
                            <Dropdown
                                options={hourOptions}
                                value={String(config.announcementHour ?? 9)}
                                onChange={(val) => handleChange({ ...config, announcementHour: Number(val) })}
                            />
                        </div>

                        <div>
                            <InputLabel>Timezone</InputLabel>
                            <Dropdown
                                options={timezoneOptions}
                                value={config.timezone || browserTz}
                                onChange={(val) => handleChange({ ...config, timezone: val || "UTC" })}
                            />
                        </div>
                    </div>

                    <ToggleSwitch
                        checked={config.requireYear}
                        onChange={(checked) => handleChange({ ...config, requireYear: checked })}
                        text="Require Birth Year from Members"
                    />

                    <div className="space-y-3 pt-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <InputLabel className="mb-0">Birthday Messages</InputLabel>

                            <SegmentedControl<"withYear" | "withoutYear">
                                value={activeTab}
                                options={[
                                    { value: "withYear", label: "With Year Known" },
                                    { value: "withoutYear", label: "Without Year" },
                                ]}
                                onChange={setActiveTab}
                            />
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
                </div>
            )}

            {isDirty && isFormValid && (
                <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending} />
            )}
        </div>
    );
}