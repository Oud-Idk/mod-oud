"use client";

import React, { useState, useMemo, useTransition, JSX } from "react";
import { toast } from "sonner";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Dropdown } from "@/components/ui/Dropdown";
import { BirthdayConfig, SaveBirthdayConfigSchema } from "@/features/birthdays/types";
import { BIRTHDAY_TEMPLATE_CONFIG } from "@/features/birthdays/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { InputLabel } from "@/components/layout/InputLabel";
import { isDeepEqual } from "@/features/_shared/embed";

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
    onSave,
    channelMap,
    roleMap,
}: BirthdaysBodyProps): JSX.Element | null {
    const [config, setConfig] = useState<BirthdayConfig>(initialConfig);
    const [isPending, startTransition] = useTransition();

    const isDirty = !isDeepEqual(config, initialConfig);
    const isChannelMissing =
        config.enabled && (config.channelId === null || config.channelId === "");

    const browserTz = useMemo<string>(() => {
        if (typeof window !== "undefined") {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            return tz !== "" ? tz : "UTC";
        }
        return "UTC";
    }, []);

    const timezoneOptions = useMemo(() => {
        const list = [...COMMON_TIMEZONES];
        if (browserTz !== "" && !list.some((tz) => tz.value === browserTz)) {
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
            const hour = i % 12 === 0 ? 12 : i % 12;
            const formattedHour = String(hour).padStart(2, "0");
            const period = i < 12 ? "AM" : "PM";
            return {
                value: String(i),
                label: `${formattedHour}:00 ${period}`,
            };
        });
    }, []);

    const handleSave = (): void => {
        const result = SaveBirthdayConfigSchema.safeParse(config);
        if (!result.success) {
            const firstMessage = result.error.issues[0].message;
            toast.error(firstMessage);
            return;
        }

        startTransition(async () => {
            try {
                await onSave(config);
                toast.success("Birthday configuration saved successfully.");
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : "Failed to save configuration.");
            }
        });
    };

    const handleCancel = (): void => {
        setConfig(initialConfig);
    };

    const timezoneValue = config.timezone !== ""
            ? config.timezone
            : browserTz;

    return (
        <div className="space-y-6">
            <ToggleSwitch
                checked={config.enabled}
                onChange={(checked) => { setConfig((prev) => ({ ...prev, enabled: checked })); }}
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
                                onChange={(val) => { setConfig((prev) => ({ ...prev, channelId: val })); }}
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
                                onChange={(val) => { setConfig((prev) => ({ ...prev, birthdayRoleId: val })); }}
                                placeholder="None (Disabled)"
                            />
                        </div>

                        <div>
                            <InputLabel>Announcement Time</InputLabel>
                            <Dropdown
                                options={hourOptions}
                                value={String(config.announcementHour)}
                                onChange={(val) => {
                                    setConfig((prev) => ({
                                        ...prev,
                                        announcementHour: val !== null && val !== ""
                                                ? parseInt(val, 10)
                                                : 9,
                                    }));
                                }}
                            />
                        </div>

                        <div>
                            <InputLabel>Timezone</InputLabel>
                            <Dropdown
                                options={timezoneOptions}
                                value={timezoneValue}
                                onChange={(val) => {
                                    setConfig((prev) => ({
                                        ...prev,
                                        timezone: val !== null && val !== ""
                                                ? val
                                                : "UTC",
                                    }));
                                }}
                            />
                        </div>
                    </div>

                    <ToggleSwitch
                        checked={config.requireYear}
                        onChange={(checked) => { setConfig((prev) => ({ ...prev, requireYear: checked })); }}
                        text="Require Birth Year from Members"
                    />

                    <div className="space-y-3 pt-2">
                        <MessageConfigEditor
                            config={config.message}
                            onChange={(msg) => {
                                setConfig((prev) =>
                                    ({ ...prev, message: {...msg, content: msg.content ?? "", embed: msg.embed ?? {}} }));
                            }}
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