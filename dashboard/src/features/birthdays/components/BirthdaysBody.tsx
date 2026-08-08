"use client";

import React, { useState, useMemo, ReactNode, useCallback, useTransition } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Dropdown } from "@/components/ui/Dropdown";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BirthdayConfig, SaveBirthdayConfigSchema } from "@/features/birthdays/types";
import { BIRTHDAY_TEMPLATE_CONFIG } from "@/features/birthdays/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import { InputLabel } from "@/components/layout/InputLabel";
import { MessageLayout, isDeepEqual } from "@/features/_shared/embed";

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
    { value: "Asia/Kathmandu", label: "(UTC+05:45) Kathmandu, Nepal" },
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
    const [config, setConfig] = useState<BirthdayConfig>(initialConfig);
    const [isPending, startTransition] = useTransition();
    const [validationError, setValidationError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"withYear" | "withoutYear">("withYear");

    // Honest Dirty Check
    const isDirty = !isDeepEqual(config, initialConfig);

    // Honest missing field checks for UI feedback
    const isChannelMissing = config.enabled && !config.channelId;

    // Detect browser's timezone automatically
    const browserTz = useMemo(() => {
        if (typeof window !== "undefined") {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        }
        return "UTC";
    }, []);

    const timezoneOptions = useMemo(() => {
        const list = [...COMMON_TIMEZONES];
        if (browserTz && !list.some((tz) => tz.value === browserTz)) {
            list.unshift({ value: browserTz, label: `Detected (${browserTz})` });
        }
        return list;
    }, [browserTz]);

    // Honest options using null for empty states
    const channelOptions = useMemo(() => {
        return Object.entries(channelMap).map(([id, name]) => ({ value: id, label: `#${name}` }));
    }, [channelMap]);

    const roleOptions = useMemo(() => {
        return Object.entries(roleMap).map(([id, name]) => ({ value: id, label: `@${name}` }));
    }, [roleMap]);

    const hourOptions = useMemo(() => {
        return Array.from({ length: 24 }, (_, i) => {
            const formattedHour = String(i % 12 || 12).padStart(2, "0");
            const period = i < 12 ? "AM" : "PM";
            return {
                value: String(i),
                label: `${formattedHour}:00 ${period}`,
            };
        });
    }, []);

    const currentMsg = activeTab === "withYear" ? config.messageWithYear : config.messageWithoutYear;

    const handleMsgChange = useCallback((updated: GenericMessageConfig): void => {
        const updatedLayout: MessageLayout = {
            format: updated.format ?? "TEXT",
            content: updated.content ?? "",
            embed: updated.embed ?? {},
        };

        setConfig((prev) => ({
            ...prev,
            [activeTab === "withYear" ? "messageWithYear" : "messageWithoutYear"]: updatedLayout,
        }));
    }, [activeTab]);

    const handleSave = () => {
        setValidationError(null);

        // Strict Validation via superRefine on Save click
        const result = SaveBirthdayConfigSchema.safeParse(config);
        if (!result.success) {
            const firstMessage = result.error.issues[0]?.message || "Invalid birthday configuration.";
            setValidationError(firstMessage);
            return;
        }

        startTransition(async () => {
            try {
                await onSave(config);
                setValidationError(null);
            } catch (err) {
                setValidationError(err instanceof Error ? err.message : "Failed to save configuration.");
            }
        });
    };

    const handleCancel = () => {
        setConfig(initialConfig);
        setValidationError(null);
    };

    return (
        <div className="space-y-6">
            {validationError && (
                <div className="p-3 text-sm text-danger bg-danger-subtle rounded-md">
                    {validationError}
                </div>
            )}

            <ToggleSwitch
                checked={config.enabled}
                onChange={(checked) => setConfig((prev) => ({ ...prev, enabled: checked }))}
                text="Enable Birthday Tracking"
            />

            {config.enabled && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <InputLabel required>Announce Channel</InputLabel>
                            <Dropdown
                                options={channelOptions}
                                value={config.channelId}
                                onChange={(val) => setConfig((prev) => ({ ...prev, channelId: val }))}
                                placeholder="Select a channel..."
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
                                value={config.birthdayRoleId}
                                onChange={(val) => setConfig((prev) => ({ ...prev, birthdayRoleId: val }))}
                                placeholder="None (Disabled)"
                            />
                        </div>

                        <div>
                            <InputLabel>Announcement Time</InputLabel>
                            <Dropdown
                                options={hourOptions}
                                value={String(config.announcementHour ?? 9)}
                                onChange={(val) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        announcementHour: val ? parseInt(val, 10) : 9,
                                    }))
                                }
                            />
                        </div>

                        <div>
                            <InputLabel>Timezone</InputLabel>
                            <Dropdown
                                options={timezoneOptions}
                                value={config.timezone || browserTz}
                                onChange={(val) =>
                                    setConfig((prev) => ({ ...prev, timezone: val || "UTC" }))
                                }
                            />
                        </div>
                    </div>

                    <ToggleSwitch
                        checked={config.requireYear}
                        onChange={(checked) => setConfig((prev) => ({ ...prev, requireYear: checked }))}
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
                            config={currentMsg}
                            onChange={handleMsgChange}
                            embedTemplateConfig={BIRTHDAY_TEMPLATE_CONFIG}
                            enableToggle={false}
                            noChannels={true}
                        />
                    </div>
                </div>
            )}

            {isDirty && (
                <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending} />
            )}
        </div>
    );
}