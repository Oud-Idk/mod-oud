"use client";

import React, { useMemo } from "react";
import { useConfigForm } from "@/hooks/useConfigForm";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { RaidDetectionConfig } from "@/types/db/config";
import { NumberInput } from "@/components/Inputs/NumberInput";

interface RaidDetectionBodyProps {
    raidDetectionConfig: RaidDetectionConfig;
    onSave: (config: RaidDetectionConfig) => Promise<void>;
}

export function RaidDetectionBody({ raidDetectionConfig, onSave }: RaidDetectionBodyProps) {
    // 1. Memoized default config to prevent render loops & handle initial null states
    const defaultConfig: RaidDetectionConfig = useMemo(() => {
        return raidDetectionConfig || {
            enabled: false,
            zScoreMultiplier: 3.0,
            minSafeLimit: 5,
            windowSizeSeconds: 60,
        };
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

    if (!config) return null;

    const windowOptions = [
        { value: "30", label: "30 Seconds (Fast Burst Detection)" },
        { value: "60", label: "1 Minute (Recommended)" },
        { value: "120", label: "2 Minutes" },
        { value: "300", label: "5 Minutes (Extended Window)" },
    ];


    return (
        <div className="max-w-4xl mx-auto py-6 space-y-6 text-white">
            <div className="space-y-6">
                {/* Header / Plugin Toggle */}
                <div
                    className={`flex items-center justify-between ${
                        config.enabled ? "pb-4 border-b border-neutral-800" : ""
                    }`}
                >
                    <div>
                        <h2 className="text-xl font-bold">Anti-Raid & Join Protection</h2>
                        <p className="text-sm text-neutral-400">
                            Dynamically detect and flag abnormal join spams using statistical anomaly detection. </p>
                    </div>
                    <ToggleSwitch
                        checked={config.enabled}
                        onChange={(checked) => handleChange({ ...config, enabled: checked })}
                        text={config.enabled ? "Enabled" : "Disabled"}
                    />
                </div>

                {/* Hide settings if module is disabled */}
                {config.enabled && (
                    <div className="space-y-6">
                        {/* Main Controls Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Sensitivity Preset Dropdown */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-neutral-200">
                                    Detection Sensitivity
                                </label>

                                <NumberInput
                                    value={config.zScoreMultiplier} onChange={(val) =>
                                    handleChange({
                                        ...config,
                                        zScoreMultiplier: Math.round((val ?? 0) * 10) / 10
                                    })
                                } step={0.1}
                                />
                                <p className="text-xs text-neutral-400">
                                    Lower values flag smaller join spikes. Higher values only trigger on massive
                                    raids. </p>
                            </div>

                            {/* Time Window Dropdown */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-neutral-200">
                                    Sliding Time Window
                                </label>
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
                                <label className="block text-sm font-medium text-neutral-200">
                                    Minimum Join Floor
                                </label>
                                <NumberInput
                                    min={1} max={100} value={config.minSafeLimit} onChange={(val) =>
                                    handleChange({
                                        ...config,
                                        minSafeLimit: Math.max(1, val ?? 1)
                                    })
                                }
                                />
                                <p className="text-xs text-neutral-400">
                                    Minimum joins required in the window to trigger an alert, preventing false alarms on
                                    quiet servers. </p>
                            </div>
                        </div>

                        {/* Informational Help Box */}
                        <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-lg space-y-1">
                            <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                                💡 How Dynamic Detection Works </h4>
                            <p className="text-xs text-neutral-400 leading-relaxed">
                                The bot analyzes your server's join history over the last 7 days to learn normal traffic
                                patterns.
                                If a join burst exceeds <span className="text-neutral-200 font-mono">Average +
                                ({config.zScoreMultiplier} × StdDev)</span> AND reaches at
                                least <span className="text-neutral-200 font-mono">{config.minSafeLimit} joins</span> in <span
                                className="text-neutral-200 font-mono"
                            >{config.windowSizeSeconds}s</span>, an anomaly alert is triggered. </p>
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