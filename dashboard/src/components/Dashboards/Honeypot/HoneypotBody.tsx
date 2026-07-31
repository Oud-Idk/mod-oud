"use client";

import { HoneypotConfig } from "@/types/db/config";
import { useConfigForm } from "@/hooks/useConfigForm";
import { useEffect, useMemo, useState } from "react";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { Dropdown } from "@/components/Inputs/Dropdown";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";
import Footer from "@/components/Layout/Footer";
import { setupHoneypotAction } from "@/actions/honeypot";
import { TextInput } from "@/components/Inputs/TextInput";
import { InputLabel } from "@/components/Layout/InputLabel";
import { getAvailableRoleOptions } from "@/utils/utils";
import { NumberInput } from "@/components/Inputs/NumberInput";
import parse from "parse-duration";

interface HoneypotBodyProps {
    honeypotConfig: HoneypotConfig;
    onSave: (config: HoneypotConfig) => Promise<void>;
    textChannelMap: Record<string, string>;
    roleMap: Record<string, string>;
    guildId: string;
}

export function HoneypotBody({ honeypotConfig, onSave, textChannelMap, guildId, roleMap }: HoneypotBodyProps) {
    const normalizedLeaveConfig = useMemo(() => honeypotConfig, [honeypotConfig]);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [channelName, setChannelName] = useState("bot-hunt");
    const [timeInput, setTimeInput] = useState<string>("");

    useEffect(() => {
        setConfig({ ...config, duration: parse(timeInput) });
    }, [timeInput])

    // New state for inline messages
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const channelOptions = useMemo(() => {
        return Object.entries(textChannelMap).map(([id, name]) => ({
            label: name,
            value: id,
        }));
    }, [textChannelMap]);
    const roleOptions = getAvailableRoleOptions(roleMap);

    const { config, setConfig, isDirty, handleSave, handleCancel, isPending } = useConfigForm({
        initialConfig: normalizedLeaveConfig,
        onSave,
    });

    const handleSetup = async () => {
        setStatus(null); // Clear any old messages
        setIsSettingUp(true);

        const result = await setupHoneypotAction(guildId, channelName);
        setIsSettingUp(false);

        if (result.success && result.channelId) {
            setConfig({
                ...config,
                channelId: result.channelId,
                enabled: true,
            });
            setStatus({ type: "success", message: "Honeypot channel set up successfully!" });
        } else {
            setStatus({ type: "error", message: result.error || "Failed to set up channel." });
        }
    };

    return <div className="space-y-2">
        <ToggleSwitch
            checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e })} text="Enable Honeypot Channel"
        />

        {config.enabled && (
            <>
                <p className="mb-0">A honeypot channel in this case means a channel that will
                    instantly ban anyone who sent a message.</p>
                <p>Since the developer is honking lazy, please go to Embed Builder and send an embed to the channel.</p>

                <InputLabel>Channel</InputLabel>
                <Dropdown
                    value={config.channelId}
                    onChange={c => setConfig({ ...config, channelId: c })}
                    options={channelOptions}
                    placeholder="Select Channel"
                    className="max-w-xs"
                />

                <InputLabel>Exempt Roles</InputLabel>
                <Dropdown
                    multiple
                    value={config.exemptRoles}
                    onChange={r => setConfig({ ...config, exemptRoles: r })}
                    options={roleOptions}
                    placeholder="Select Roles to Exempt"
                    className="max-w-xs"
                />

                <InputLabel>Delete Messages Before (DMD)</InputLabel>
                <NumberInput
                    value={config.dmd}
                    onChange={v => setConfig({ ...config, dmd: v ?? 0 })}
                    min={0}
                    max={7}
                    className="max-w-xs"
                />

                <InputLabel>Reason</InputLabel>
                <TextInput
                    value={config.reason ?? "Sending a message in a honeypot channel"}
                    onChange={r => setConfig({ ...config, reason: r.target.value })}
                    disableSubmitButton
                    placeholder="Sending a message in a honeypot channel"
                />

                <InputLabel>Duration</InputLabel>
                <TextInput
                    value={timeInput}
                    onChange={i => setTimeInput(i.target.value)}
                    disableSubmitButton
                    placeholder="Leave blank for permanent"
                />
                <Footer>{config.duration === null ? "Time is either invalid or empty. Assuming permanent" : `${config.duration} ms`}</Footer>

                {config.channelId.trim() === "" && (
                    <>
                        <InputLabel>Channel Name</InputLabel>
                        <TextInput
                            value={channelName} onChange={s => setChannelName(s.target.value)} disableSubmitButton
                        />
                        <div className="flex flex-col gap-2 items-start">
                            <PrimaryButton
                                onClick={handleSetup} disabled={isDirty || isSettingUp}
                            >
                                {isSettingUp ? "Setting up..." : "Set Up For Me!"}
                            </PrimaryButton>
                            {status && (
                                <p className={`text-sm ${status.type === "success" ? "text-green-500" : "text-red-500"}`}>
                                    {status.message}
                                </p>
                            )}
                            {isDirty && (<Footer>Save first before you can set it up, dummy.</Footer>)}
                        </div>
                    </>
                )}
            </>
        )}

        {isDirty && (
            <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}/>
        )}
    </div>
}