"use client";

import { Switch } from "@headlessui/react";
import { twMerge } from "tailwind-merge";

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
}: ToggleSwitchProps) {
    return (
        <label
            className={twMerge(
                "inline-flex items-center gap-3 select-none font-medium text-foreground cursor-pointer",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
        >
            {text && <span>{text}</span>}

            <Switch
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                className={twMerge(
                    "group relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",

                    // Track Colors (Off = Border/Muted Surface | On = Brand)
                    "bg-border data-checked:bg-brand",

                    // Focus Ring (Keyboard Accessibility)
                    "focus-ring",

                    // Disabled Cursor
                    "disabled:cursor-not-allowed",

                    !shrink && "shrink-0"
                )}
            >
                {/* Thumb / Knob */}
                <span
                    className={twMerge(
                        "size-4 rounded-full transition-transform translate-x-1",
                        // Thumb color adapts to brand foreground when active
                        "bg-surface group-data-checked:bg-brand-foreground group-data-checked:translate-x-6"
                    )}
                />
            </Switch>
        </label>
    );
}