"use client";

import { JSX } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronsUpDown } from "lucide-react";
import { RuleAction } from "@/types/config/messageFiltering";

interface ActionsSettingsProps {
    actions: RuleAction[];
    timeoutDuration?: number;
    onChange: (actions: RuleAction[], timeoutDuration?: number) => void;
}

export function ActionsSettings({ actions, timeoutDuration, onChange }: ActionsSettingsProps): JSX.Element {
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium">Actions</label>
            <Listbox
                value={actions} onChange={(selected: RuleAction[]) => {
                // If timeout was removed from selected actions, clear timeout duration
                const hasTimeout = selected.includes("timeout");
                onChange(selected, hasTimeout ? timeoutDuration : undefined);
            }} multiple
            >
                <div className="relative inline-block text-left">
                    <ListboxButton className="relative w-64 cursor-pointer rounded-md border border-neutral-500 bg-neutral-300/10 py-2 pl-3 pr-10 text-left text-sm focus:outline-none">
                        <span className={`block truncate ${!actions.length ? "text-neutral-500" : "font-medium"}`}>
                            {actions.length ? actions.map(a => a.toLowerCase().replace("_", " ").replace(/\b\w/g, char => char.toUpperCase())).join(", ") : "Select actions..."}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <ChevronsUpDown className="h-4 w-4 text-neutral-400"/>
                        </span>
                    </ListboxButton>

                    <ListboxOptions className="absolute z-50 mt-1 max-h-40 w-64 overflow-auto rounded-md bg-white py-1 text-sm shadow-[0px_0px_10px_-2px_rgba(0,0,0,0.5)] dark:bg-neutral-900 focus:outline-none">
                        {(["delete", "warn", "timeout", "remind_publicly", "remind_privately"] as RuleAction[]).map((opt) => (
                            <ListboxOption
                                key={opt} value={opt} className={({ focus }) =>
                                `relative cursor-pointer select-none py-2 pl-10 pr-4 transition-colors ${focus ? "bg-neutral-300/10 dark:text-white text-black" : "text-neutral-900 dark:text-neutral-200"}`
                            }
                            >
                                {({ selected }) => (
                                    <>
                                        <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{opt.toLowerCase().replace("_", " ").replace(/\b\w/g, char => char.toUpperCase())}</span>
                                        {selected && (
                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                                <Check className="h-4 w-4"/>
                                            </span>
                                        )}
                                    </>
                                )}
                            </ListboxOption>
                        ))}
                    </ListboxOptions>
                </div>
            </Listbox>

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

