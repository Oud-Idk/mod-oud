"use client";

import { JSX } from "react";
import { Dropdown, DropdownOption } from "@/components/ui/Dropdown";
import { InputLabel } from "@/components/layout/InputLabel";
import { RuleAction } from "@/features/message-filtering/types";
import { NumberInput } from "@/components/ui/NumberInput";

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
        <div className="space-y-2 max-w-md">
            <InputLabel>Actions</InputLabel>

            <Dropdown<RuleAction>
                multiple
                options={ACTION_OPTIONS}
                value={actions}
                placeholder="Select actions..."
                onChange={(selected) => {
                    const selectedActions = selected;
                    const hasTimeout = selectedActions.includes("TIMEOUT");
                    onChange(selectedActions, hasTimeout ? timeoutDuration : undefined);
                }}
            />

            {actions.includes("TIMEOUT") && (
                <div className="mt-2">
                    <InputLabel>Timeout duration (seconds)</InputLabel>
                    <NumberInput value={timeoutDuration ?? 60} onChange={v => { onChange(actions, v ?? 60) }}/>
                </div>
            )}
        </div>
    );
}

export default ActionsSettings;