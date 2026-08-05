"use client";

import React, { ReactNode, useMemo } from "react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Dropdown } from "@/components/ui/Dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import { InputLabel } from "@/components/layout/InputLabel";

import { RaidActionKind, RaidStatusSnapshot, RaidAction, RaidDetectionConfig } from "@/features/raid-detection/types";
import { WelcomeConfig } from "@/features/welcome/types";

interface RaidDetectionBodyProps {
    raidDetectionConfig: RaidDetectionConfig;
    welcomeConfig: WelcomeConfig;
    channelMap: Record<string, string>;
    onSave: (config: RaidDetectionConfig) => Promise<void>;
    raidStatus: RaidStatusSnapshot;
}

export function RaidDetectionBody({
    raidDetectionConfig,
    welcomeConfig,
    channelMap,
    onSave,
    raidStatus,
}: RaidDetectionBodyProps): ReactNode | null {
    const defaultConfig: RaidDetectionConfig = useMemo(() => {
        return (
            raidDetectionConfig || {
                enabled: false,
                zScoreMultiplier: 3.0,
                minSafeLimit: 5,
                windowSizeSeconds: 60,
                raidActions: [],
            }
        );
    }, [raidDetectionConfig]);

    const { config, isPending, isDirty, handleSave, handleCancel, handleChange } =
        useConfigForm<RaidDetectionConfig>({
            initialConfig: defaultConfig,
            onSave: async (updatedConfig) => {
                if (updatedConfig) {
                    await onSave(updatedConfig);
                }
            },
        });

    const channelOptions = useMemo(() => {
        return Object.entries(channelMap || {}).map(([id, name]) => ({
            value: id,
            label: `#${name}`,
        }));
    }, [channelMap]);

    if (!config) return null;

    const windowOptions = [
        { value: "30", label: "30 Seconds (Fast Burst Detection)" },
        { value: "60", label: "1 Minute (Recommended)" },
        { value: "120", label: "2 Minutes" },
        { value: "300", label: "5 Minutes (Extended Window)" },
    ];

    const raidOptions: { value: RaidActionKind; label: string }[] = [
        { value: "ALERT", label: "Alert Moderator" },
        { value: "LOCKDOWN_SERVER", label: "Lockdown Server" },
        { value: "PAUSE_INVITES", label: "Pause All Invites" },
        { value: "BUMP_VERIFICATION", label: "Bump Verification to Max" },
        { value: "AUTO_BAN_NEW_ACCOUNTS", label: "Auto Ban New Accounts" },
        { value: "TIMEOUT_NEW_JOINS", label: "Timeout New Join" },
    ];

    function mapRaidActionToKind(action: RaidAction): RaidActionKind {
        switch (action.type) {
            case "ALERT":
                return "ALERT";
            case "LOCKDOWN_SERVER":
                return "LOCKDOWN_SERVER";
            case "PAUSE_INVITES":
                return "PAUSE_INVITES";
            case "BUMP_VERIFICATION":
                return "BUMP_VERIFICATION";
            case "TIMEOUT_NEW_JOINS":
                return "TIMEOUT_NEW_JOINS";
            case "AUTO_BAN_NEW_ACCOUNTS":
                return "AUTO_BAN_NEW_ACCOUNTS";
        }
    }

    function createRaidAction(
        kind: RaidActionKind,
        extra: { mins?: number; maxAgeHours?: number; channelId?: string; hour?: number },
    ): RaidAction {
        switch (kind) {
            case "ALERT":
                return { type: "ALERT", channelId: extra.channelId ?? "" };
            case "LOCKDOWN_SERVER":
                return { type: "LOCKDOWN_SERVER" };
            case "PAUSE_INVITES":
                return { type: "PAUSE_INVITES", hour: extra.hour ?? 24 };
            case "BUMP_VERIFICATION":
                return { type: "BUMP_VERIFICATION" };
            case "TIMEOUT_NEW_JOINS":
                return { type: "TIMEOUT_NEW_JOINS", mins: extra.mins ?? 15 };
            case "AUTO_BAN_NEW_ACCOUNTS":
                return { type: "AUTO_BAN_NEW_ACCOUNTS", maxAgeHours: extra.maxAgeHours ?? 24 };
        }
    }

    const currentActions = config.raidActions || [];

    // Find configured actions for conditional input fields
    const alertAction = currentActions.find((action) => action.type === "ALERT");
    const timeoutAction = currentActions.find((action) => action.type === "TIMEOUT_NEW_JOINS");
    const autoBanAction = currentActions.find((action) => action.type === "AUTO_BAN_NEW_ACCOUNTS");
    const pauseInvitesAction = currentActions.find((action) => action.type === "PAUSE_INVITES");

    const isBumpVerificationSelected = currentActions.some(
        (action) => action.type === "BUMP_VERIFICATION",
    );
    const isVerificationDisabled =
        !welcomeConfig?.verification?.enabled ||
        !welcomeConfig?.verification?.verificationChannelId ||
        !welcomeConfig?.verification?.verificationMessageId;

    return (
        <div>
            <div className="space-y-3">
                <ToggleSwitch
                    checked={config.enabled}
                    onChange={(checked) => handleChange({ ...config, enabled: checked })}
                    text="Enable Raid Detection"
                />

                {/* Hide settings if module is disabled */}
                {config.enabled && (
                    <div className="space-y-6">
                        {raidStatus?.isRaidActive && (
                            <div className="p-4 border-red-700 dark:border-red-300 rounded-lg flex items-center justify-between gap-4 text-red-200 animate-pulse">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl select-none">🚨</span>
                                    <div>
                                        <strong className="font-semibold block text-red-100 text-sm">
                                            Active Raid Detected!
                                        </strong>
                                        <p className="text-xs text-red-300">
                                            Automated raid defenses are actively triggering. Recorded{" "}
                                            <span className="font-mono font-bold text-white">
                                                {raidStatus.currentJoinsInWindow}
                                            </span>{" "}
                                            joins in the current window (Threshold: {raidStatus.calculatedThreshold}).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-4 border rounded-xl">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                                <div className="flex items-center gap-2">
                                    <p>Live Monitor Status </p>
                                    {raidStatus?.isRaidActive ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                            </span>
                                            Raid Active
                                        </span>
                                    ) : raidStatus?.statsAvailable ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                                            Monitoring Normal
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                                            Calibrating Baseline
                                        </span>
                                    )}
                                </div>

                                {!raidStatus?.statsAvailable && (
                                    <span className="text-xs text-amber-400/90 font-medium">
                                        ⚠️ Collecting 7-day traffic baseline...
                                    </span>
                                )}
                            </div>

                            {/* Status Metrics Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {/* Current Joins in Window */}
                                <div className="p-3 rounded-md border border-neutral-500 space-y-1 bg-neutral-300/10">
                                    <span className="text-xs block font-medium">
                                        Active Traffic
                                    </span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg font-bold font-mono">
                                            {raidStatus?.currentJoinsInWindow ?? 0}
                                        </span>
                                        <span className="text-xs">
                                            / {raidStatus?.windowSizeSeconds ?? 60}s
                                        </span>
                                    </div>
                                </div>

                                {/* Dynamic Threshold */}
                                <div className="p-3 rounded-md border border-neutral-500 space-y-1 bg-neutral-300/10">
                                    <span className="text-xs block font-medium">
                                        Trigger Threshold
                                    </span>
                                    <div className="text-lg font-bold font-mono">
                                        {raidStatus?.calculatedThreshold ?? 0}
                                        <span className="text-xs font-normal ml-1 font-sans">
                                            joins
                                        </span>
                                    </div>
                                </div>

                                {/* Baseline Avg */}
                                <div className="p-3 rounded-md border border-neutral-500 space-y-1 bg-neutral-300/10">
                                    <span className="text-xs block font-medium">
                                        Avg Joins / Min
                                    </span>
                                    <div className="text-lg font-bold font-mono">
                                        {(raidStatus?.avgJoinsPerMin ?? 0).toFixed(1)}
                                    </div>
                                </div>

                                {/* Std Deviation */}
                                <div className="p-3 rounded-md border border-neutral-500 space-y-1 bg-neutral-300/10">
                                    <span className="text-xs block font-medium">
                                        Std Deviation
                                    </span>
                                    <div className="text-lg font-bold font-mono">
                                        ±{(raidStatus?.stdDevPerMin ?? 0).toFixed(1)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Main Controls Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Sensitivity Preset Dropdown */}
                            <div className="space-y-2">
                                <InputLabel>
                                    Detection Sensitivity
                                </InputLabel>
                                <NumberInput
                                    value={config.zScoreMultiplier} onChange={(val) =>
                                    handleChange({
                                        ...config,
                                        zScoreMultiplier: Math.round((val ?? 0) * 10) / 10,
                                    })
                                } step={0.1}
                                />
                                <p className="text-xs text-neutral-400">
                                    Lower values flag smaller join spikes. Higher values only trigger on massive
                                    raids. </p>
                            </div>

                            {/* Time Window Dropdown */}
                            <div className="space-y-2">
                                <InputLabel>Sliding Time Window</InputLabel>
                                <Dropdown
                                    options={windowOptions}
                                    value={String(config.windowSizeSeconds ?? 60)}
                                    onChange={(val) =>
                                        handleChange({ ...config, windowSizeSeconds: Number(val) })
                                    }
                                />
                                <p className="text-xs text-neutral-400">
                                    The time frame over which rapid joins are calculated. </p>
                            </div>

                            {/* Minimum Safe Floor */}
                            <div className="space-y-2">
                                <InputLabel>Minimum Join Floor</InputLabel>
                                <NumberInput
                                    min={1} max={100} value={config.minSafeLimit} onChange={(val) =>
                                    handleChange({
                                        ...config,
                                        minSafeLimit: Math.max(1, val ?? 1),
                                    })
                                }
                                />
                                <p className="text-xs text-neutral-400">
                                    Minimum joins required in the window to trigger an alert, preventing false alarms on
                                    quiet servers. </p>
                            </div>

                            {/* Raid Actions Multi-Select Dropdown */}
                            <div className="space-y-2">
                                <InputLabel>Automated Raid Actions</InputLabel>
                                <Dropdown<RaidActionKind> options={raidOptions}
                                    value={currentActions.map((action) => mapRaidActionToKind(action))}
                                    multiple={true}
                                    placeholder="Select raid defense actions..."
                                    onChange={(selectedKinds) => {
                                        const updatedActions = selectedKinds.map((kind): RaidAction => {
                                            const existing = currentActions.find(
                                                (a) => mapRaidActionToKind(a) === kind,
                                            );
                                            if (existing) return existing;

                                            return createRaidAction(kind, {
                                                mins: 15,
                                                hour: 24,
                                                maxAgeHours: 24,
                                                channelId: Object.keys(channelMap || {})[0] ?? "",
                                            });
                                        });

                                        handleChange({
                                            ...config,
                                            raidActions: updatedActions,
                                        });
                                    }}
                                />
                                <p className="text-xs text-neutral-400">
                                    Actions the bot will automatically execute when a raid spike is detected. </p>
                            </div>

                            {/* Dynamic Action Inputs */}

                            {/* Alert Channel Select Dropdown */}
                            {alertAction && (
                                <div className="space-y-2">
                                    <InputLabel>Alert Notification Channel</InputLabel>
                                    <Dropdown
                                        options={channelOptions}
                                        value={alertAction.channelId || ""}
                                        placeholder="Select channel for raid alerts..."
                                        onChange={(channelId) => {
                                            const updatedActions = currentActions.map((action) =>
                                                action.type === "ALERT"
                                                    ? { ...action, channel_id: String(channelId) }
                                                    : action,
                                            );
                                            handleChange({ ...config, raidActions: updatedActions });
                                        }}
                                    />
                                    <p className="text-xs text-neutral-400">
                                        The channel where moderator raid alert messages will be dispatched. </p>
                                </div>
                            )}

                            {/* Pause Invites Duration Input */}
                            {pauseInvitesAction && pauseInvitesAction.type === "PAUSE_INVITES" && (
                                <div className="space-y-2">
                                    <InputLabel>Pause Invites Duration (Hours)</InputLabel>
                                    <NumberInput
                                        min={1}
                                        max={168} // max 7 days
                                        value={pauseInvitesAction.hour ?? 24}
                                        onChange={(val) => {
                                            const updatedActions = currentActions.map((action) =>
                                                action.type === "PAUSE_INVITES"
                                                    ? { ...action, hour: Math.max(1, val ?? 24) }
                                                    : action,
                                            );
                                            handleChange({ ...config, raidActions: updatedActions });
                                        }}
                                    />
                                    <p className="text-xs text-neutral-400">
                                        Duration to pause server invite links during an active raid spike. </p>
                                </div>
                            )}

                            {/* Timeout Duration Input */}
                            {timeoutAction && timeoutAction.type === "TIMEOUT_NEW_JOINS" && (
                                <div className="space-y-2">
                                    <InputLabel>Timeout Duration (Minutes)</InputLabel>
                                    <NumberInput
                                        min={1}
                                        max={40320} // max 28 days
                                        value={timeoutAction.mins ?? 15}
                                        onChange={(val) => {
                                            const updatedActions = currentActions.map((action) =>
                                                action.type === "TIMEOUT_NEW_JOINS"
                                                    ? { ...action, mins: Math.max(1, val ?? 15) }
                                                    : action,
                                            );
                                            handleChange({ ...config, raidActions: updatedActions });
                                        }}
                                    />
                                    <p className="text-xs text-neutral-400">
                                        Duration to timeout users who join during an active raid spike. </p>
                                </div>
                            )}

                            {/* Auto-Ban Account Age Input */}
                            {autoBanAction && autoBanAction.type === "AUTO_BAN_NEW_ACCOUNTS" && (
                                <div className="space-y-2">
                                    <InputLabel>Auto-Ban Account Age Limit (Hours)</InputLabel>
                                    <NumberInput
                                        min={1}
                                        max={8760} // max 1 year
                                        value={autoBanAction.maxAgeHours ?? 24}
                                        onChange={(val) => {
                                            const updatedActions = currentActions.map((action) =>
                                                action.type === "AUTO_BAN_NEW_ACCOUNTS"
                                                    ? { ...action, max_age_hours: Math.max(1, val ?? 24) }
                                                    : action,
                                            );
                                            handleChange({ ...config, raidActions: updatedActions });
                                        }}
                                    />
                                    <p className="text-xs text-neutral-400">
                                        Only accounts created less than this many hours ago will be automatically banned
                                        during a raid. </p>
                                </div>
                            )}
                        </div>

                        {/* Warning: Verification Module Disabled */}
                        {isBumpVerificationSelected && isVerificationDisabled && (
                            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3 text-amber-300 text-xs leading-relaxed">
                                <span className="text-base select-none">⚠️</span>
                                <div>
                                    <strong className="font-semibold block text-amber-200 mb-0.5">
                                        Verification is Disabled
                                    </strong>
                                    You have configured <em>&quot;Bump Verification to Max&quot;</em> as a raid action, but server
                                    verification is currently disabled / not set up in your Verification settings. This
                                    action will have no effect during a raid until verification is enabled.
                                </div>
                            </div>
                        )}

                        {/* Informational Help Box */}
                        <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-lg space-y-1">
                            <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                                💡 How Dynamic Detection Works </h4>
                            <p className="text-xs text-neutral-400 leading-relaxed">
                                The bot analyzes your server&apos;s join history over the last 7 days to learn normal traffic
                                patterns. If a join burst exceeds{" "}
                                <span className="text-neutral-200 font-mono">
                                    Average + ({config.zScoreMultiplier} × StdDev)
                                </span>{" "}
                                AND reaches at least{" "}
                                <span className="text-neutral-200 font-mono">
                                    {config.minSafeLimit} joins
                                </span>{" "}
                                in{" "}
                                <span className="text-neutral-200 font-mono">
                                    {config.windowSizeSeconds}s
                                </span>
                                , an anomaly alert is triggered. </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Unsaved Changes Popup */}
            {isDirty && (
                <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}/>
            )}
        </div>
    );
}