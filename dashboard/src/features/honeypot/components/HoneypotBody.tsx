"use client";

import React, { JSX, useState } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import Footer from "@/components/layout/Footer";
import { setupHoneypotAction } from "@/features/honeypot/actions";
import { TextInput } from "@/components/ui/TextInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { getAvailableRoleOptions, getAvailableChannelOptions } from "@/features/_shared/dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import parse from "parse-duration";
import { HoneypotConfig, honeypotConfigSchema } from "@/features/honeypot/types";
import { toast } from "sonner";

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
}: HoneypotBodyProps): JSX.Element {
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [channelName, setChannelName] = useState("bot-hunt");
    const [timeInput, setTimeInput] = useState<string>("");

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave: originalHandleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: honeypotConfig,
        onSave,
    });

    const handleSave = (): void => {
        const result = honeypotConfigSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0].message);
            return;
        }
        originalHandleSave();
    };

    const channelOptions = getAvailableChannelOptions(textChannelMap);
    const roleOptions = getAvailableRoleOptions(roleMap);

    const handleDurationChange = (val: string): void => {
        setTimeInput(val);
        const parsedMs = val.trim() === "" ? null : parse(val);
        setConfig((prev) => ({
            ...prev,
            duration: parsedMs,
        }));
    };

    const handleCancelWrapper = (): void => {
        handleCancel();
        setTimeInput("");
    };

    const handleSetup = async (): Promise<void> => {
        setIsSettingUp(true);

        const result = await setupHoneypotAction(guildId, channelName);
        setIsSettingUp(false);

        if (result.success && result.channelId) {
            setConfig((prev) => ({
                ...prev,
                channelId: result.channelId,
                enabled: true,
            }));
            toast.success("Honeypot channel set up successfully!");
        } else if (!result.success) {
            toast.error(result.error || "Failed to set up channel.");
        }
    };

    return (
        <div className="space-y-4">
            <ToggleSwitch
                checked={config.enabled}
                onChange={(e) =>{  setConfig((prev) => ({ ...prev, enabled: e })); }}
                text="Enable Honeypot Channel"
            />

            {config.enabled && (
                <div className="space-y-4 max-w-md">
                    <div className="space-y-2">
                        <InputLabel>Channel</InputLabel>
                        <Dropdown
                            value={config.channelId ?? ""}
                            onChange={(c) =>{  setConfig((prev) => ({ ...prev, channelId: c ?? null })); }}
                            options={channelOptions}
                            placeholder="Select Channel"
                        />
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Exempt Roles</InputLabel>
                        <Dropdown
                            multiple
                            value={config.exemptRoles}
                            onChange={(r) =>{  setConfig((prev) => ({ ...prev, exemptRoles: r ?? [] })); }}
                            options={roleOptions}
                            placeholder="Select Roles to Exempt"
                        />
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Delete Messages Before (DMD)</InputLabel>
                        <NumberInput
                            value={config.dmd}
                            onChange={(v) =>{  setConfig((prev) => ({ ...prev, dmd: v ?? 0 })); }}
                            min={0}
                            max={7}
                        />
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Reason</InputLabel>
                        <TextInput
                            value={config.reason ?? "Sending a message in a honeypot channel"}
                            onChange={(r) =>{  setConfig((prev) => ({ ...prev, reason: r.target.value })); }}
                            placeholder="Sending a message in a honeypot channel"
                        />
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Duration</InputLabel>
                        <TextInput
                            value={timeInput}
                            onChange={(i) =>{  handleDurationChange(i.target.value); }}
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
                                onChange={(s) =>{  setChannelName(s.target.value); }}
                            />
                            <div className="flex flex-col gap-2 items-start pt-1">
                                <Button
                                    onClick={handleSetup}
                                    disabled={isDirty || isSettingUp || isPending}
                                >
                                    {isSettingUp ? "Setting up..." : "Set Up For Me!"}
                                </Button>

                                {isDirty && (
                                    <Footer>Save your changes first before setting up the channel.</Footer>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isDirty && (
                <SavePopup handleCancel={handleCancelWrapper} handleSave={handleSave} isSaving={isPending} />
            )}
        </div>
    );
}