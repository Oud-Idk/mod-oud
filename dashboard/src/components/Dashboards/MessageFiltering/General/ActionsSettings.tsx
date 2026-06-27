"use client";

import { JSX } from "react";
import { RuleAction } from "@/types/config/messageFiltering";
import { Dropdown, DropdownOption } from "@/components/Inputs/Dropdown";

interface ActionsSettingsProps {
    actions: RuleAction[];
    timeoutDuration?: number;
    onChange: (actions: RuleAction[], timeoutDuration?: number) => void;
}

// Map RuleAction options to DropdownOption format
const ACTION_OPTIONS: DropdownOption[] = [
    { value: "delete", label: "Delete" },
    { value: "warn", label: "Warn" },
    { value: "timeout", label: "Timeout" },
    { value: "remind_publicly", label: "Remind Publicly" },
    { value: "remind_privately", label: "Remind Privately" },
];

export function ActionsSettings({ actions, timeoutDuration, onChange }: ActionsSettingsProps): JSX.Element {
    return (
        <div className="space-y-2">
            <label className="block font-medium">Actions</label>

            <Dropdown
                multiple
                options={ACTION_OPTIONS}
                value={actions}
                placeholder="Select actions..."
                className="max-w-xs"
                onChange={(selected) => {
                    const selectedActions = selected as RuleAction[];
                    const hasTimeout = selectedActions.includes("timeout");
                    onChange(selectedActions, hasTimeout ? timeoutDuration : undefined);
                }}
            />

            {actions.includes("timeout") && (
                <div className="mt-2">
                    <label className="text-sm block">Timeout duration (seconds)</label>
                    <input
                        type="number"
                        min={1}
                        value={timeoutDuration ?? 60}
                        onChange={(e) => onChange(actions, parseInt(e.target.value || "0", 10))}
                        className="w-40 border rounded px-2 py-1 text-sm"
                    />
                </div>
            )}
        </div>
    );
}

export default ActionsSettings;