"use client";

import React, { ReactNode, useMemo, useCallback } from "react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Dropdown } from "@/components/ui/Dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { AlertTriangle, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
    RaidActionKind,
    RaidStatusSnapshot,
    RaidAction,
    RaidDetectionConfig,
    raidDetectionConfigSchema,
} from "@/features/raid-detection/types";
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
    const normalizedConfig = useMemo(() => raidDetectionConfig, [raidDetectionConfig]);

    const { config, setConfig, isPending, isDirty, handleSave, handleCancel } =
        useConfigForm<RaidDetectionConfig>({
            initialConfig: normalizedConfig,
            onSave,
        });

    const handleChange = useCallback((updated: Partial<RaidDetectionConfig>) => {
        setConfig((prev) => ({ ...prev, ...updated }));
    }, [setConfig]);

    const channelOptions = useMemo(() => {
        return Object.entries(channelMap).map(([id, name]) => ({
            value: id,
            label: `#${name}`,
        }));
    }, [channelMap]);

    const windowOptions = [
        { value: "30", label: "30 Seconds (Fast Burst Detection)" },
        { value: "60", label: "1 Minute (Recommended)" },
        { value: "120", label: "2 Minutes" },
        { value: "300", label: "5 Minutes (Extended Window)" },
    ];

    const raidOptions: { value: RaidActionKind; label: string }[] = [
        { value: "ALERT", label: "Alert Moderator Channel" },
        { value: "LOCKDOWN_SERVER", label: "Lockdown Server Channels" },
        { value: "PAUSE_INVITES", label: "Pause Server Invites" },
        { value: "BUMP_VERIFICATION", label: "Bump Verification Level to Max" },
        { value: "AUTO_BAN_NEW_ACCOUNTS", label: "Auto-Ban New Accounts" },
        { value: "TIMEOUT_NEW_JOINS", label: "Timeout New Joins" },
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

    const currentActions = config.raidActions;

    const alertAction = currentActions.find(
        (action): action is Extract<RaidAction, { type: "ALERT" }> => action.type === "ALERT",
    );
    const timeoutAction = currentActions.find(
        (action): action is Extract<RaidAction, { type: "TIMEOUT_NEW_JOINS" }> => action.type === "TIMEOUT_NEW_JOINS",
    );
    const autoBanAction = currentActions.find(
        (action): action is Extract<RaidAction, { type: "AUTO_BAN_NEW_ACCOUNTS" }> => action.type === "AUTO_BAN_NEW_ACCOUNTS",
    );
    const pauseInvitesAction = currentActions.find(
        (action): action is Extract<RaidAction, { type: "PAUSE_INVITES" }> => action.type === "PAUSE_INVITES",
    );

    const isBumpVerificationSelected = currentActions.some(
        (action) => action.type === "BUMP_VERIFICATION",
    );

    const verification = welcomeConfig.verification;
    const isVerificationDisabled =
        !verification.enabled ||
        verification.verificationChannelId === null ||
        verification.verificationChannelId.length === 0 ||
        verification.verificationMessageId === null ||
        verification.verificationMessageId.length === 0;

    const hasDynamicActionFields =
        alertAction !== undefined ||
        pauseInvitesAction !== undefined ||
        timeoutAction !== undefined ||
        autoBanAction !== undefined;

    const onValidatedSave = (): void => {
        const validation = raidDetectionConfigSchema.safeParse(config);
        if (!validation.success) {
            toast.error(validation.error.issues[0].message);
            return;
        }
        void handleSave();
    };

    return (
        <div className="space-y-6">
            <ToggleSwitch
                checked={config.enabled}
                onChange={(checked) => { handleChange({ enabled: checked }); }}
                text="Enable Anti-Raid Defense System"
            />

            {config.enabled && (
                <div className="space-y-6">
                    {raidStatus.isRaidActive && (
                        <div
                            className="p-4 bg-danger-subtle border border-danger-border rounded-xl flex items-start justify-between gap-4 text-danger animate-pulse">
                            <div className="flex items-start gap-3">
                                <ShieldAlert className="w-6 h-6 shrink-0 mt-0.5"/>
                                <div>
                                    <strong className="font-bold block text-sm">
                                        Active Server Raid Detected!
                                    </strong>
                                    <p className="text-xs mt-0.5 opacity-90">
                                        Automated defenses are active. Recorded{" "}
                                        <span className="font-mono font-bold">
                                            {raidStatus.currentJoinsInWindow}
                                        </span>{" "}
                                        joins in window (Threshold: {raidStatus.calculatedThreshold}).
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                            <div className="flex items-center gap-2.5">
                                <span className="font-semibold text-sm text-foreground">
                                    Live Monitor Status
                                </span>
                                {raidStatus.isRaidActive ? (
                                    <span
                                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger-subtle text-danger border border-danger-border">
                                        <span className="relative flex h-2 w-2">
                                            <span
                                                className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                                            <span
                                                className="relative inline-flex rounded-full h-2 w-2 bg-danger"></span>
                                        </span>
                                        Raid Active
                                    </span>
                                ) : raidStatus.statsAvailable ? (
                                    <span
                                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-subtle text-success border border-success/30">
                                        <span className="h-2 w-2 rounded-full bg-success"></span>
                                        Monitoring Normal
                                    </span>
                                ) : (
                                    <span
                                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-subtle text-warning border border-warning/30">
                                        <span className="h-2 w-2 rounded-full bg-warning"></span>
                                        Calibrating Baseline
                                    </span>
                                )}
                            </div>

                            {!raidStatus.statsAvailable && (
                                <span className="text-xs text-warning font-medium">
                                    ⚠️ Collecting 7-day traffic baseline...
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3 bg-surface-muted border border-border rounded-lg space-y-1">
                                <span className="text-xs font-medium text-muted-foreground block">
                                    Active Traffic
                                </span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-lg font-bold font-mono text-foreground">
                                        {raidStatus.currentJoinsInWindow}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        / {raidStatus.windowSizeSeconds}s
                                    </span>
                                </div>
                            </div>

                            <div className="p-3 bg-surface-muted border border-border rounded-lg space-y-1">
                                <span className="text-xs font-medium text-muted-foreground block">
                                    Trigger Threshold
                                </span>
                                <div className="text-lg font-bold font-mono text-foreground">
                                    {raidStatus.calculatedThreshold}
                                    <span className="text-xs font-normal ml-1 font-sans text-muted-foreground">
                                        joins
                                    </span>
                                </div>
                            </div>

                            <div className="p-3 bg-surface-muted border border-border rounded-lg space-y-1">
                                <span className="text-xs font-medium text-muted-foreground block">
                                    Avg Joins / Min
                                </span>
                                <div className="text-lg font-bold font-mono text-foreground">
                                    {raidStatus.avgJoinsPerMin.toFixed(1)}
                                </div>
                            </div>

                            <div className="p-3 bg-surface-muted border border-border rounded-lg space-y-1">
                                <span className="text-xs font-medium text-muted-foreground block">
                                    Std Deviation
                                </span>
                                <div className="text-lg font-bold font-mono text-foreground">
                                    ±{raidStatus.stdDevPerMin.toFixed(1)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <InputLabel>Detection Sensitivity (Z-Score)</InputLabel>
                            <NumberInput
                                value={config.zScoreMultiplier}
                                step={0.1}
                                onChange={(val) => {
                                    handleChange({
                                        zScoreMultiplier: Math.round((val ?? 0) * 10) / 10,
                                    });
                                }}
                            />
                            <p className="text-xs text-muted-foreground">
                                Lower values flag smaller spikes. Higher values trigger only on massive join waves.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <InputLabel>Sliding Time Window</InputLabel>
                            <Dropdown
                                options={windowOptions}
                                value={String(config.windowSizeSeconds)}
                                onChange={(val) => {
                                    handleChange({ windowSizeSeconds: Number(val) });
                                }}
                            />
                            <p className="text-xs text-muted-foreground">
                                The timeframe over which join spikes are calculated.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <InputLabel>Minimum Join Floor</InputLabel>
                            <NumberInput
                                min={1}
                                max={100}
                                value={config.minSafeLimit}
                                onChange={(val) => {
                                    handleChange({
                                        minSafeLimit: Math.max(1, val ?? 1),
                                    });
                                }}
                            />
                            <p className="text-xs text-muted-foreground">
                                Minimum joins required in window before an alert can trigger, preventing false alarms on quiet servers.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <InputLabel>Automated Raid Actions</InputLabel>
                            <Dropdown<RaidActionKind>
                                options={raidOptions}
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
                                            channelId: Object.keys(channelMap)[0] ?? "",
                                        });
                                    });

                                    handleChange({
                                        raidActions: updatedActions,
                                    });
                                }}
                            />
                            <p className="text-xs text-muted-foreground">
                                Defensive actions executed automatically when a raid is flagged.
                            </p>
                        </div>
                    </div>

                    {hasDynamicActionFields && (
                        <div className="pt-4 border-t border-border-subtle space-y-4">
                            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                Action Parameters Configuration
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {alertAction !== undefined && (
                                    <div className="space-y-2">
                                        <InputLabel>Alert Notification Channel</InputLabel>
                                        <Dropdown
                                            options={channelOptions}
                                            value={alertAction.channelId}
                                            placeholder="Select channel for raid alerts..."
                                            onChange={(channelId) => {
                                                const updatedActions = currentActions.map((action) =>
                                                    action.type === "ALERT"
                                                        ? { ...action, channelId: String(channelId) }
                                                        : action,
                                                );
                                                handleChange({ raidActions: updatedActions });
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            The channel where moderator raid notification messages will be posted.
                                        </p>
                                    </div>
                                )}

                                {pauseInvitesAction !== undefined && (
                                    <div className="space-y-2">
                                        <InputLabel>Pause Invites Duration (Hours)</InputLabel>
                                        <NumberInput
                                            min={1}
                                            max={168}
                                            value={pauseInvitesAction.hour}
                                            onChange={(val) => {
                                                const updatedActions = currentActions.map((action) =>
                                                    action.type === "PAUSE_INVITES"
                                                        ? { ...action, hour: Math.max(1, val ?? 24) }
                                                        : action,
                                                );
                                                handleChange({ raidActions: updatedActions });
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Duration to pause server invite links during a detected raid.
                                        </p>
                                    </div>
                                )}

                                {timeoutAction !== undefined && (
                                    <div className="space-y-2">
                                        <InputLabel>Timeout Duration (Minutes)</InputLabel>
                                        <NumberInput
                                            min={1}
                                            max={40320}
                                            value={timeoutAction.mins}
                                            onChange={(val) => {
                                                const updatedActions = currentActions.map((action) =>
                                                    action.type === "TIMEOUT_NEW_JOINS"
                                                        ? { ...action, mins: Math.max(1, val ?? 15) }
                                                        : action,
                                                );
                                                handleChange({ raidActions: updatedActions });
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Timeout duration applied to members who join during a raid.
                                        </p>
                                    </div>
                                )}

                                {autoBanAction !== undefined && (
                                    <div className="space-y-2">
                                        <InputLabel>Auto-Ban Account Age Limit (Hours)</InputLabel>
                                        <NumberInput
                                            min={1}
                                            max={8760}
                                            value={autoBanAction.maxAgeHours}
                                            onChange={(val) => {
                                                const updatedActions = currentActions.map((action) =>
                                                    action.type === "AUTO_BAN_NEW_ACCOUNTS"
                                                        ? { ...action, maxAgeHours: Math.max(1, val ?? 24) }
                                                        : action,
                                                );
                                                handleChange({ raidActions: updatedActions });
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Only accounts younger than this limit will be automatically banned.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {isBumpVerificationSelected && isVerificationDisabled && (
                        <div
                            className="p-4 bg-warning-subtle border border-warning/30 rounded-xl flex items-start gap-3 text-warning text-xs leading-relaxed">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5"/>
                            <div>
                                <strong className="font-semibold block text-sm mb-0.5">
                                    Verification Module Disabled
                                </strong>
                                You have selected <em>&quot;Bump Verification Level to Max&quot;</em> as a raid action,
                                but server verification is currently disabled or incomplete in your Verification
                                settings.
                            </div>
                        </div>
                    )}

                    <div className="p-4 bg-surface-muted border border-border rounded-xl space-y-1.5">
                        <div
                            className="flex items-center gap-1.5 text-foreground font-semibold text-xs uppercase tracking-wider">
                            <Sparkles className="w-4 h-4 text-brand"/>
                            <span>How Dynamic Anomaly Detection Works</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            The bot analyzes your server&apos;s join history over the past 7 days to calculate your baseline traffic.
                        </p>
                    </div>
                </div>
            )}

            {isDirty && (
                <SavePopup handleCancel={handleCancel} handleSave={onValidatedSave} isSaving={isPending}/>
            )}
        </div>
    );
}