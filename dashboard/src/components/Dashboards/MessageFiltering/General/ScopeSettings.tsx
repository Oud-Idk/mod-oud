"use client";

import { JSX } from "react";
import { Radio, RadioGroup } from "@headlessui/react";
import { MultiSelectViewer } from "@/components/MultiSelectViewer";
import { Dropdown } from "@/components/Dropdown";
import { getAvailableRoleOptions } from "@/utils/utils";

export type ScopeMode = "exempt" | "enforced";

export interface ScopeShape {
    mode: ScopeMode;
    channels: string[];
    roles: string[];
}

interface ScopeSettingsProps {
    scope: ScopeShape;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
    onChange: (scope: ScopeShape) => void;
}

export function ScopeSettings({ scope, channelMap, roleMap, onChange }: ScopeSettingsProps): JSX.Element {
    // local helpers mirror the previous implementation so callers don't need to manage low-level toggles
    const handleModeChange = (mode: ScopeMode) => {
        onChange({ mode, channels: [], roles: [] });
    };

    const toggleScopeItem = (key: "channels" | "roles", id: string) => {
        const currentList = (scope as any)[key] || [];
        const updatedList = currentList.includes(id) ? currentList.filter((item: string) => item !== id) : [...currentList, id];
        onChange({ ...scope, [key]: updatedList });
    };

    return (
        <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-semibold uppercase tracking-wider">Scope Settings</h4>

            <div className="space-y-2">
                <label className="block text-sm font-medium">Filter Behavior</label>
                <RadioGroup
                    value={scope.mode} onChange={(v) => handleModeChange(v as ScopeMode)} className="flex gap-4"
                >
                    <Radio
                        value="exempt"
                        className={({ checked }) => `ring-offset-1 rounded-md p-2 cursor-pointer flex items-center gap-2 text-sm ${checked ? "bg-neutral-300/10" : ""}`}
                    >
                        {({ checked }) => (
                            <>
                                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-neutral-500 ${checked ? "bg-primary-600" : "bg-transparent"}`}>
                                    {checked ? <span className="w-2 h-2 rounded-full bg-white" aria-hidden/> : null}
                                </span>
                                <span>Run everywhere except selected (Exempt)</span>
                            </>
                        )}
                    </Radio>

                    <Radio
                        value="enforced"
                        className={({ checked }) => `ring-offset-1 rounded-md p-2 cursor-pointer flex items-center gap-2 text-sm ${checked ? "bg-neutral-300/10" : ""}`}
                    >
                        {({ checked }) => (
                            <>
                                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-neutral-500 ${checked ? "bg-primary-600" : "bg-transparent"}`}>
                                    {checked ? <span className="w-2 h-2 rounded-full bg-white" aria-hidden/> : null}
                                </span>
                                <span>Run only on selected (Enforced)</span>
                            </>
                        )}
                    </Radio>
                </RadioGroup>
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">{scope.mode === "exempt" ? "Exempt Channels" : "Enforced Channels"}</label>
                <MultiSelectViewer
                    selectedList={scope.channels || []}
                    onDelete={(id) => toggleScopeItem("channels", id)}
                    map={channelMap}
                    placeholder={scope.mode === "exempt" ? "No channels exempted" : "No channels enforced"}
                    prefix="#"
                />
                <Dropdown
                    options={Object.entries(channelMap || {}).filter(([id]) => !(scope.channels || []).includes(id)).map(([id, name]) => ({
                        value: id,
                        label: `#${name}`
                    }))}
                    value={""}
                    onChange={(val) => {
                        if (val) toggleScopeItem("channels", val);
                    }}
                    placeholder={scope.mode === "exempt" ? "Choose a channel to exempt..." : "Choose a channel to enforce..."}
                    className="max-w-xs"
                />
            </div>

            <div className="space-y-2">
                <label className="block text-sm font-medium">{scope.mode === "exempt" ? "Exempt Roles" : "Enforced Roles"}</label>
                <MultiSelectViewer
                    selectedList={scope.roles || []}
                    onDelete={(id) => toggleScopeItem("roles", id)}
                    map={roleMap}
                    placeholder={scope.mode === "exempt" ? "No roles exempted" : "No roles enforced"}
                    prefix="@"
                />
                <Dropdown
                    options={getAvailableRoleOptions(roleMap, scope?.roles)}
                    value={""}
                    onChange={(val) => {
                        if (val) toggleScopeItem("roles", val);
                    }}
                    placeholder={scope.mode === "exempt" ? "Choose a role to exempt..." : "Choose a role to enforce..."}
                    className="max-w-xs"
                />
            </div>
        </div>
    );
}

export default ScopeSettings;

