"use client";

import { Switch } from "@headlessui/react";
import { twMerge } from "tailwind-merge";

interface EnableSwitchProps {
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    text?: string;
    className?: string;
    shrink?: boolean;
}

export function ToggleSwitch({
    checked,
    onChange: setEnabled,
    disabled,
    text,
    className,
    shrink,
}: EnableSwitchProps) {
    return (
        <div className={twMerge("text-xl flex flex-row gap-4 items-center text-wrap", className)}>
            {text && (<p>{text}</p>)}
            <Switch
                checked={checked}
                onChange={setEnabled}
                disabled={disabled}
                className={`group inline-flex h-6 w-11 items-center rounded-full bg-neutral-500 transition data-checked:bg-blue-500 ${!shrink ? "shrink-0" : ""}`}
            >
                <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-checked:translate-x-6"/>
            </Switch>
        </div>
    );
}