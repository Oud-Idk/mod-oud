"use client";

import { Switch } from "@headlessui/react";
import { twMerge } from "tailwind-merge";
import { InputLabel } from "@/components/layout/InputLabel";
import { JSX } from "react";

export interface ToggleSwitchProps {
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    text?: string;
    className?: string;
    shrink?: boolean;
}

export function ToggleSwitch({
    checked,
    onChange,
    disabled = false,
    text,
    className,
    shrink = false,
}: ToggleSwitchProps): JSX.Element {
    return (
        <InputLabel
            className={twMerge(
                "inline-flex items-center gap-3 select-none font-medium text-foreground mt-0",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
        >
            {text !== undefined && <span>{text}</span>}

            <Switch
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                className={twMerge(
                    "group relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
                    "bg-border data-checked:bg-brand",
                    "focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    "disabled:cursor-not-allowed",
                    !shrink && "shrink-0"
                )}
            >
                {/* Thumb / Knob */}
                <span
                    className={twMerge(
                        "size-4 rounded-full transition-transform translate-x-1",
                        "bg-surface group-data-checked:bg-brand-foreground group-data-checked:translate-x-6"
                    )}
                />
            </Switch>
        </InputLabel>
    );
}