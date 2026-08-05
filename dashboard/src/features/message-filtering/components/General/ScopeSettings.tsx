"use client";

import { JSX } from "react";
import { Radio, RadioGroup } from "@headlessui/react";
import { MultiSelectViewer } from "@/components/ui/MultiSelectViewer";
import { Dropdown } from "@/components/ui/Dropdown";
import { getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { ScopeActionMode } from "@/features/message-filtering/types";

export interface ScopeShape {
    mode: ScopeActionMode;
    channels: string[];
    roles: string[];
}

interface ScopeSettingsProps {
    scope?: Partial<ScopeShape> | null; // 👈 Now optional!
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
    onChange: (scope: ScopeShape) => void;
}

// Fallback default scope in case it's missing
const DEFAULT_SCOPE: ScopeShape = {
    mode: "EXEMPT" as ScopeActionMode,
    channels: [],
    roles: [],
};

export function ScopeSettings({
    scope: rawScope,
    channelMap = {},
    roleMap = {},
    onChange,
}: ScopeSettingsProps): JSX.Element {
    // Fill in defaults so we don't crash on undefined/null scope
    const scope: ScopeShape = {
        mode: rawScope?.mode ?? DEFAULT_SCOPE.mode,
        channels: rawScope?.channels ?? DEFAULT_SCOPE.channels,
        roles: rawScope?.roles ?? DEFAULT_SCOPE.roles,
    };

    // Normalize mode to uppercase just in case ScopeActionMode uses uppercase string literals
    const currentMode = String(scope.mode).toUpperCase();
    const isExempt = currentMode === "EXEMPT";

    const handleModeChange = (mode: ScopeActionMode) => {
        onChange({ mode, channels: [], roles: [] });
    };

    // Fixed key type to match ScopeShape keys directly ("channels" | "roles")
    const toggleScopeItem = (key: "channels" | "roles", id: string) => {
        const currentList = scope[key] || [];
        const updatedList = currentList.includes(id)
            ? currentList.filter((item) => item !== id)
            : [...currentList, id];

        onChange({ ...scope, [key]: updatedList });
    };

    return (
        <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-semibold uppercase tracking-wider">
                Scope Settings </h4>

            <div className="space-y-2">
                <label className="block text-sm font-medium">Filter Behavior</label>
                <RadioGroup
                    value={isExempt ? "EXEMPT" : "ENFORCED"}
                    onChange={(v) => handleModeChange(v as ScopeActionMode)}
                    className="flex gap-4"
                >
                    <Radio
                        value="EXEMPT" className={({ checked }) =>
                        `ring-offset-1 rounded-md p-2 cursor-pointer flex items-center gap-2 text-sm ${
                            checked ? "bg-neutral-300/10" : ""
                        }`
                    }
                    >
                        {({ checked }) => (
                            <>
                                <span
                                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-neutral-500 ${
                                        checked ? "bg-primary-600" : "bg-transparent"
                                    }`}
                                >
                                    {checked ? (
                                        <span
                                            className="w-2 h-2 rounded-full bg-black dark:bg-white" aria-hidden
                                        />
                                    ) : null}
                                </span>
                                <span>Run everywhere except selected (Exempt)</span>
                            </>
                        )}
                    </Radio>

                    <Radio
                        value="ENFORCED" className={({ checked }) =>
                        `ring-offset-1 rounded-md p-2 cursor-pointer flex items-center gap-2 text-sm ${
                            checked ? "bg-neutral-300/10" : ""
                        }`
                    }
                    >
                        {({ checked }) => (
                            <>
                                <span
                                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-neutral-500 ${
                                        checked ? "bg-primary-600" : "bg-transparent"
                                    }`}
                                >
                                    {checked ? (
                                        <span
                                            className="w-2 h-2 rounded-full bg-black dark:bg-white" aria-hidden
                                        />
                                    ) : null}
                                </span>
                                <span>Run only on selected (Enforced)</span>
                            </>
                        )}
                    </Radio>
                </RadioGroup>
            </div>

            {/* Channels Section */}
            <div className="space-y-2">
                <label className="block text-sm font-medium">
                    {isExempt ? "Exempt Channels" : "Enforced Channels"}
                </label>
                <MultiSelectViewer
                    selectedList={scope.channels}
                    onDelete={(id) => toggleScopeItem("channels", id)}
                    map={channelMap}
                    placeholder={
                        isExempt ? "No channels exempted" : "No channels enforced"
                    }
                    prefix="#"
                />
                <Dropdown
                    options={Object.entries(channelMap)
                        .filter(([id]) => !scope.channels.includes(id))
                        .map(([id, name]) => ({
                            value: id,
                            label: `#${name}`,
                        }))} value={""} onChange={(val) => {
                    if (val) toggleScopeItem("channels", val);
                }} placeholder={
                    isExempt
                        ? "Choose a channel to exempt..."
                        : "Choose a channel to enforce..."
                } className="max-w-xs"
                />
            </div>

            {/* Roles Section */}
            <div className="space-y-2">
                <label className="block text-sm font-medium">
                    {isExempt ? "Exempt Roles" : "Enforced Roles"}
                </label>
                <MultiSelectViewer
                    selectedList={scope.roles}
                    onDelete={(id) => toggleScopeItem("roles", id)}
                    map={roleMap}
                    placeholder={
                        isExempt ? "No roles exempted" : "No roles enforced"
                    }
                    prefix="@"
                />
                <Dropdown
                    options={getAvailableRoleOptions(roleMap, scope.roles)} value={""} onChange={(val) => {
                    if (val) toggleScopeItem("roles", val);
                }} placeholder={
                    isExempt
                        ? "Choose a role to exempt..."
                        : "Choose a role to enforce..."
                } className="max-w-xs"
                />
            </div>
        </div>
    );
}

export default ScopeSettings;