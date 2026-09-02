"use client";

import React, { JSX } from "react";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { EconomyConfig, economyConfigSchema } from "@/features/economy/types";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { DurationInput } from "@/components/ui/inputs/DurationInput";
import { TextInput } from "@/components/ui/inputs/TextInput";

interface EconomyGeneralSettingsProps {
    economyConfig: EconomyConfig;
    onSave: (config: EconomyConfig) => Promise<void>;
}

export function EconomyGeneralSettingsTab({
    economyConfig,
    onSave,
}: EconomyGeneralSettingsProps): JSX.Element {
    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: economyConfig,
        onSave,
        schema: economyConfigSchema,
    });

    return (
        <div className="space-y-4 max-w-md pt-2">
            <ToggleSwitch
                checked={config.enabled}
                onChange={(enabled) => {
                    setConfig((prev) => ({ ...prev, enabled }));
                }}
                text="Enable Economy"
            />

            {config.enabled && (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <InputLabel>Currency Name</InputLabel>
                            <TextInput
                                value={config.currencyName}
                                onChange={(e) => {
                                    setConfig((prev) => ({ ...prev, currencyName: e.target.value }))
                                }}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <InputLabel>Work Cooldown</InputLabel>
                            <DurationInput
                                value={config.workCooldownSecs}
                                onChange={(cooldown) => {
                                    setConfig((prev) => ({ ...prev, workCooldownSecs: cooldown }));
                                }}
                                className="w-full justify-center"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <InputLabel>Minimum Work Reward</InputLabel>
                            <NumberInput
                                value={config.workMinReward}
                                onChange={(min) => {
                                    setConfig((prev) => ({ ...prev, workMinReward: min ?? 1000 }));
                                }}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <InputLabel>Maximum Work Reward</InputLabel>
                            <NumberInput
                                value={config.workMaxReward}
                                onChange={(max) => {
                                    setConfig((prev) => ({ ...prev, workMaxReward: max ?? 5000 }));
                                }}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div>
                        <InputLabel>Starting Balance</InputLabel>
                        <NumberInput
                            value={config.startingBalance}
                            onChange={(val) => {
                                setConfig((prev) => ({ ...prev, startingBalance: val ?? 0 }));
                            }}
                            className="w-full"
                        />
                        <p className="text-xs mt-1">Initial wallet amount for new users on first
                            interaction.</p>
                    </div>

                    <ToggleSwitch
                        checked={config.giftingEnabled}
                        onChange={(giftingEnabled) => {
                            setConfig((prev) => ({ ...prev, giftingEnabled }));
                        }}
                        text="Allow Item Gifting"
                    />
                    <p className="text-xs -mt-3">Enables <code className="px-1 py-0.5 bg-surface-muted rounded text-xs">/economy gift</code> for transferring inventory items between users.</p>
                </>
            )}

            {isDirty && (
                <SavePopup handleCancel={handleCancel} handleSave={handleSave}
                           isSaving={isPending}/>
            )}
        </div>
    );
}