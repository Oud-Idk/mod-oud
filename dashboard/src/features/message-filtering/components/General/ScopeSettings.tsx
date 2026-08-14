"use client";

import { JSX } from "react";
import { Radio, RadioGroup } from "@headlessui/react";
import { Dropdown } from "@/components/ui/Dropdown";
import { ScopeActionMode } from "@/features/message-filtering/types";
import { cn } from "@/lib/cn";
import { getAvailableChannelOptions, getAvailableRoleOptions } from "@/features/_shared/dropdown";
import Emphasis from "@/components/layout/Emphasis";
import { InputLabel } from "@/components/layout/InputLabel";

export interface ScopeShape {
    mode: ScopeActionMode;
    channels: string[];
    roles: string[];
}

interface ScopeSettingsProps {
    scope?: Partial<ScopeShape> | null;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
    onChange: (scope: ScopeShape) => void;
}

const DEFAULT_SCOPE: ScopeShape = {
    mode: "EXEMPT",
    channels: [],
    roles: [],
};

export function ScopeSettings({
    scope: rawScope,
    channelMap = {},
    roleMap = {},
    onChange,
}: ScopeSettingsProps): JSX.Element {
    const scope: ScopeShape = {
        mode: rawScope?.mode ?? DEFAULT_SCOPE.mode,
        channels: rawScope?.channels ?? DEFAULT_SCOPE.channels,
        roles: rawScope?.roles ?? DEFAULT_SCOPE.roles,
    };

    const currentMode = scope.mode.toUpperCase();
    const isExempt = currentMode === "EXEMPT";

    const handleModeChange = (mode: ScopeActionMode) => {
        onChange({ mode, channels: [], roles: [] });
    };


    const channelOptions = getAvailableChannelOptions(channelMap);
    const roleOptions = getAvailableRoleOptions(roleMap);

    return (
        <div>
            <Emphasis>Scope Settings</Emphasis>

            <div className="space-y-2 max-w-md">
                <InputLabel className="block mt-0">
                    Filter Behavior
                </InputLabel>
                <RadioGroup
                    value={isExempt ? "EXEMPT" : "ENFORCED"}
                    onChange={(v) =>{  handleModeChange(v as ScopeActionMode); }}
                    className="space-y-3"
                >
                    <Radio
                        value="EXEMPT"
                        className={({ checked }) =>
                            cn(
                                "flex items-center gap-3 py-2 px-4 rounded border cursor-pointer transition-all text-sm font-medium",
                                checked
                                    ? "bg-surface-muted/50 border-brand text-foreground shadow-sm"
                                    : "bg-surface border-border hover:bg-surface-active/50 text-muted-foreground"
                            )
                        }
                    >
                        {({ checked }) => (
                            <>
                                <span
                                    className={cn(
                                        "inline-flex items-center justify-center w-4 h-4 rounded-full border transition-colors shrink-0",
                                        checked
                                            ? "border-brand bg-brand text-brand-foreground"
                                            : "border-border bg-transparent"
                                    )}
                                >
                                    {checked && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-foreground" />
                                    )}
                                </span>
                                <span>Run everywhere except selected (Exempt)</span>
                            </>
                        )}
                    </Radio>

                    <Radio
                        value="ENFORCED"
                        className={({ checked }) =>
                            cn(
                                "flex items-center gap-3 py-2 px-4 rounded border cursor-pointer transition-all text-sm font-medium",
                                checked
                                    ? "bg-surface-muted/50 border-brand text-foreground shadow-sm"
                                    : "bg-surface border-border hover:bg-surface-active/50 text-muted-foreground"
                            )
                        }
                    >
                        {({ checked }) => (
                            <>
                                <span
                                    className={cn(
                                        "inline-flex items-center justify-center w-4 h-4 rounded-full border transition-colors shrink-0",
                                        checked
                                            ? "border-brand bg-brand text-brand-foreground"
                                            : "border-border bg-transparent"
                                    )}
                                >
                                    {checked && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-foreground" />
                                    )}
                                </span>
                                <span>Run only on selected (Enforced)</span>
                            </>
                        )}
                    </Radio>
                </RadioGroup>
            </div>

            {/* Channels Section */}
            <div className="space-y-2">
                <InputLabel className="block">
                    {isExempt ? "Exempt Channels" : "Enforced Channels"}
                </InputLabel>
                <Dropdown
                    multiple={true}
                    options={channelOptions}
                    value={scope.channels}
                    onChange={(newChannels) =>{  onChange({ ...scope, channels: newChannels }); }}
                    placeholder={
                        isExempt
                            ? "Select channels to exempt..."
                            : "Select channels to enforce..."
                    }
                    className="max-w-md"
                />
            </div>

            {/* Roles Section */}
            <div className="space-y-2">
                <InputLabel className="block">
                    {isExempt ? "Exempt Roles" : "Enforced Roles"}
                </InputLabel>
                <Dropdown
                    multiple={true}
                    options={roleOptions}
                    value={scope.roles}
                    onChange={(newRoles) =>{  onChange({ ...scope, roles: newRoles }); }}
                    placeholder={
                        isExempt
                            ? "Select roles to exempt..."
                            : "Select roles to enforce..."
                    }
                    className="max-w-md"
                />
            </div>
        </div>
    );
}

export default ScopeSettings;