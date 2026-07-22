"use client";

import { JSX } from "react";
import { Dropdown, DropdownOption } from "@/components/Inputs/Dropdown";
import { RuleAction } from "@/types/db";

interface ActionsSettingsProps {
    actions: RuleAction[];
    timeoutDuration?: number;
    onChange: (actions: RuleAction[], timeoutDuration?: number) => void;
}

// Map RuleAction options to DropdownOption format
const ACTION_OPTIONS: DropdownOption<RuleAction>[] = [
    { value: "DELETE", label: "Delete" },
    { value: "WARN", label: "Warn" },
    { value: "TIMEOUT", label: "Timeout" },
    { value: "REMIND_PUBLICLY", label: "Remind Publicly" },
    { value: "REMIND_PRIVATELY", label: "Remind Privately" },
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
                    const hasTimeout = selectedActions.includes("TIMEOUT");
                    onChange(selectedActions, hasTimeout ? timeoutDuration : undefined);
                }}
            />

            {actions.includes("TIMEOUT") && (
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