"use client";

import React, { JSX } from "react";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { GamblingConfig, gamblingConfigSchema } from "@/features/gambling/types";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { DurationInput } from "@/components/ui/inputs/DurationInput";
import Footer from "@/components/layout/Footer";

interface GamblingBodyProps {
    gamblingConfig: GamblingConfig;
    onSave: (config: GamblingConfig) => Promise<void>;
}

export function GamblingBody({ gamblingConfig, onSave }: GamblingBodyProps): JSX.Element {
    const { config, setConfig, isPending, isDirty, handleSave, handleCancel } = useConfigForm({
        initialConfig: gamblingConfig,
        onSave,
        schema: gamblingConfigSchema,
    });

    return (
        <div className="space-y-6 max-w-2xl pt-2">
            <ToggleSwitch
                checked={config.enabled}
                onChange={(enabled) => {
                    setConfig((prev) => ({ ...prev, enabled }));
                }}
                text="Enable Gambling"
            />
            <Footer className="text-xs">
                When disabled, all gambling commands reject with an ephemeral message even if users
                have balance.
            </Footer>

            {config.enabled && (
                <>
                    {/* Bet limits & cooldowns */}
                    <div
                        className="bg-surface border border-border rounded-xl p-5 space-y-4 shadow-xs">
                        <h3 className="text-sm font-semibold text-foreground">Bet Limits &
                            Cooldown</h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <InputLabel>Minimum Bet</InputLabel>
                                <NumberInput
                                    value={config.minBet}
                                    min={1}
                                    onChange={(v) => {
                                        setConfig((prev) => ({ ...prev, minBet: v ?? 10 }));
                                    }}
                                    className="w-full"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Lowest allowed
                                    wager (≥1).</p>
                            </div>
                            <div>
                                <InputLabel>Maximum Bet (0 = no cap)</InputLabel>
                                <NumberInput
                                    value={config.maxBet}
                                    min={0}
                                    onChange={(v) => {
                                        setConfig((prev) => ({ ...prev, maxBet: v ?? 0 }));
                                    }}
                                    className="w-full"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Set 0 to disable
                                    upper bound.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <InputLabel>Global Cooldown</InputLabel>
                                <DurationInput
                                    value={config.cooldownSecs}
                                    onChange={(secs) => {
                                        setConfig((prev) => ({ ...prev, cooldownSecs: secs }));
                                    }}
                                    className="w-full justify-center"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Per-user cooldown
                                    shared across all games. 0 = disabled.</p>
                            </div>
                            <div>
                                <InputLabel>Interactive Timeout</InputLabel>
                                <DurationInput
                                    value={config.timeoutSecs}
                                    onChange={(secs) => {
                                        const clamped = Math.max(10, Math.min(300, secs));
                                        setConfig((prev) => ({ ...prev, timeoutSecs: clamped }));
                                    }}
                                    className="w-full justify-center"
                                />
                                <p className="text-xs text-muted-foreground mt-1">For blackjack &
                                    higher/lower. Clamped 10–300s.</p>
                            </div>
                        </div>
                    </div>

                    {/* Per-game toggles */}
                    <div
                        className="bg-surface border border-border rounded-xl p-5 space-y-3 shadow-xs">
                        <h3 className="text-sm font-semibold text-foreground">Enabled Games</h3>
                        <p className="text-xs text-muted-foreground">Disable individual games
                            without disabling the whole module.</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            <ToggleSwitch
                                checked={config.blackjack.enabled}
                                onChange={(enabled) => {
                                    setConfig((prev) => ({ ...prev, blackjack: { enabled } }));
                                }}
                                text="Blackjack"
                            />
                            <ToggleSwitch
                                checked={config.coinflip.enabled}
                                onChange={(enabled) => {
                                    setConfig((prev) => ({ ...prev, coinflip: { enabled } }));
                                }}
                                text="Coinflip"
                            />
                            <ToggleSwitch
                                checked={config.slots.enabled}
                                onChange={(enabled) => {
                                    setConfig((prev) => ({ ...prev, slots: { enabled } }));
                                }}
                                text="Slots"
                            />
                            <ToggleSwitch
                                checked={config.roulette.enabled}
                                onChange={(enabled) => {
                                    setConfig((prev) => ({ ...prev, roulette: { enabled } }));
                                }}
                                text="Roulette"
                            />
                            <ToggleSwitch
                                checked={config.higherlower.enabled}
                                onChange={(enabled) => {
                                    setConfig((prev) => ({ ...prev, higherlower: { enabled } }));
                                }}
                                text="Higher / Lower"
                            />
                        </div>
                    </div>
                </>
            )}

            {isDirty && <SavePopup handleCancel={handleCancel} handleSave={handleSave}
                                   isSaving={isPending}/>}
        </div>
    );
}
