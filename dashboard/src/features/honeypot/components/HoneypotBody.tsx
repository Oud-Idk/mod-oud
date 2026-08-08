"use client";

import React, { ReactNode, useState, useEffect, useTransition } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { Dropdown } from "@/components/ui/Dropdown";
import PrimaryButton from "@/components/ui/buttons/PrimaryButton";
import Footer from "@/components/layout/Footer";
import { setupHoneypotAction } from "@/features/honeypot/actions";
import { TextInput } from "@/components/ui/TextInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { getAvailableRoleOptions, getAvailableChannelOptions } from "@/features/_shared/dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import parse from "parse-duration";
import { HoneypotConfig, honeypotConfigSchema } from "@/features/honeypot/types";
import { isDeepEqual } from "@/features/_shared/embed";

interface HoneypotBodyProps {
    honeypotConfig: HoneypotConfig;
    onSave: (config: HoneypotConfig) => Promise<void>;
    textChannelMap: Record<string, string>;
    roleMap: Record<string, string>;
    guildId: string;
}

export function HoneypotBody({
    honeypotConfig,
    onSave,
    textChannelMap,
    guildId,
    roleMap,
}: HoneypotBodyProps): ReactNode {
    const [config, setConfig] = useState<HoneypotConfig>(honeypotConfig);
    const [isPending, startTransition] = useTransition();
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [channelName, setChannelName] = useState("bot-hunt");
    const [timeInput, setTimeInput] = useState<string>("");
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        setConfig(honeypotConfig);
        setValidationError(null);
    }, [honeypotConfig]);

    const isDirty = !isDeepEqual(config, honeypotConfig);

    const channelOptions = getAvailableChannelOptions(textChannelMap);
    const roleOptions = getAvailableRoleOptions(roleMap);

    const handleDurationChange = (val: string) => {
        setTimeInput(val);
        const parsedMs = val.trim() === "" ? null : parse(val);
        setConfig((prev) => ({
            ...prev,
            duration: parsedMs,
        }));
    };

    const handleSave = () => {
        setValidationError(null);
        const result = honeypotConfigSchema.safeParse(config);
        if (!result.success) {
            setValidationError(result.error.issues[0]?.message || "Invalid configuration.");
            return;
        }

        startTransition(async () => {
            try {
                await onSave(result.data);
                setStatus({ type: "success", message: "Configuration saved successfully!" });
            } catch (err) {
                setValidationError(err instanceof Error ? err.message : "Failed to save configuration.");
            }
        });
    };

    const handleCancel = () => {
        setConfig(honeypotConfig);
        setTimeInput("");
        setValidationError(null);
    };

    const handleSetup = async (): Promise<void> => {
        setStatus(null);
        setValidationError(null);
        setIsSettingUp(true);

        const result = await setupHoneypotAction(guildId, channelName);
        setIsSettingUp(false);

        if (result.success && result.channelId) {
            setConfig((prev) => ({
                ...prev,
                channelId: result.channelId,
                enabled: true,
            }));
            setStatus({ type: "success", message: "Honeypot channel set up successfully!" });
        } else if (!result.success) {
            setStatus({ type: "error", message: result.error || "Failed to set up channel." });
        }
    };

    return (
        <div className="space-y-4">
            {validationError && (
                <div className="p-3 mb-4 text-sm text-danger bg-danger-subtle rounded-md font-medium">
                    {validationError}
                </div>
            )}

            <ToggleSwitch
                checked={config.enabled}
                onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e }))}
                text="Enable Honeypot Channel"
            />

            {config.enabled && (
                <div className="space-y-4 max-w-md">
                    <div className="space-y-2">
                        <InputLabel>Channel</InputLabel>
                        <Dropdown
                            value={config.channelId ?? undefined}
                            onChange={(c) => setConfig((prev) => ({ ...prev, channelId: c ?? null }))}
                            options={channelOptions}
                            placeholder="Select Channel"
                        />
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Exempt Roles</InputLabel>
                        <Dropdown
                            multiple
                            value={config.exemptRoles}
                            onChange={(r) => setConfig((prev) => ({ ...prev, exemptRoles: r ?? [] }))}
                            options={roleOptions}
                            placeholder="Select Roles to Exempt"
                        />
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Delete Messages Before (DMD)</InputLabel>
                        <NumberInput
                            value={config.dmd}
                            onChange={(v) => setConfig((prev) => ({ ...prev, dmd: v ?? 0 }))}
                            min={0}
                            max={7}
                        />
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Reason</InputLabel>
                        <TextInput
                            value={config.reason ?? "Sending a message in a honeypot channel"}
                            onChange={(r) => setConfig((prev) => ({ ...prev, reason: r.target.value }))}
                            placeholder="Sending a message in a honeypot channel"
                        />
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Duration</InputLabel>
                        <TextInput
                            value={timeInput}
                            onChange={(i) => handleDurationChange(i.target.value)}
                            placeholder="Leave blank for permanent"
                        />
                        <Footer>
                            {config.duration === null
                                ? "Time is either invalid or empty. Assuming permanent."
                                : `${config.duration} ms`}
                        </Footer>
                    </div>

                    {!config.channelId && (
                        <div className="space-y-2 pt-2 border-t border-border-subtle">
                            <InputLabel>Channel Name</InputLabel>
                            <TextInput
                                value={channelName}
                                onChange={(s) => setChannelName(s.target.value)}
                            />
                            <div className="flex flex-col gap-2 items-start pt-1">
                                <PrimaryButton
                                    onClick={handleSetup}
                                    disabled={isDirty || isSettingUp || isPending}
                                >
                                    {isSettingUp ? "Setting up..." : "Set Up For Me!"}
                                </PrimaryButton>

                                {status && (
                                    <p
                                        className={`text-sm ${
                                            status.type === "success" ? "text-green-500" : "text-red-500"
                                        }`}
                                    >
                                        {status.message}
                                    </p>
                                )}

                                {isDirty && (
                                    <Footer>Save your changes first before setting up the channel.</Footer>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isDirty && (
                <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending} />
            )}
        </div>
    );
}