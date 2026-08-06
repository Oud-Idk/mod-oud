"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DropdownOption<T extends string> {
    value: T;
    label: string;
}

interface BaseDropdownProps<T extends string> {
    options: DropdownOption<T>[];
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    className?: string;
}

interface SingleDropdownProps<T extends string> extends BaseDropdownProps<T> {
    multiple?: false;
    value: T | null | undefined;
    onChange: (value: T | null) => void;
    allowClear?: boolean;
}

interface MultiDropdownProps<T extends string> extends BaseDropdownProps<T> {
    multiple: true;
    value: T[];
    onChange: (value: T[]) => void;
}

export type DropdownProps<T extends string> = SingleDropdownProps<T> | MultiDropdownProps<T>;

export function Dropdown<T extends string>({
    options,
    value,
    onChange,
    placeholder = "Select an option",
    disabled,
    error,
    className,
    multiple = false,
}: DropdownProps<T>) {
    const selectedLabels = multiple && Array.isArray(value)
        ? options
            .filter((opt) => value.includes(opt.value))
            .map((opt) => opt.label)
        : value
            ? [options.find((opt) => opt.value === value)?.label].filter((l): l is string => !!l)
            : [];

    const hasSelection = selectedLabels.length > 0;
    const displayText = hasSelection ? selectedLabels.join(", ") : placeholder;

    return (
        <div className={cn("w-full relative", className)}>
            <Listbox value={value} disabled={disabled} onChange={onChange as any} multiple={multiple}>
                <div className="relative">
                    <ListboxButton
                        aria-invalid={error ? true : undefined}
                        className={cn(
                            // Base Layout & Typography
                            "relative w-full cursor-pointer rounded-md border bg-surface py-2 pl-3 pr-10 text-left text-sm transition-all duration-150",
                            "disabled:cursor-not-allowed disabled:opacity-50",

                            // Focus Ring Improvements (Uses focus-visible for clean keyboard navigation)
                            "focus:outline-none focus-visible:ring-2 focus-visible:border-brand",

                            // State Based Colors (Normal vs Error)
                            error
                                ? "border-danger-subtle"
                                : "border-border focus-visible:ring-focus-ring"
                        )}
                    >
                        <span className={cn("block truncate font-medium", !hasSelection && "text-muted-foreground")}>
                            {displayText}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </span>
                    </ListboxButton>

                    <ListboxOptions
                        anchor="bottom start"
                        transition
                        className={cn(
                            // Popover Container
                            "z-50 max-h-60 w-(--button-width) overflow-auto rounded-md bg-surface-elevated py-1 text-sm border border-border shadow-dropdown [--anchor-gap:4px]",
                            "focus:outline-none",

                            // Headless UI Smooth Fade/Scale Micro-Animation
                            "transition duration-100 ease-out data-closed:scale-95 data-closed:opacity-0"
                        )}
                    >
                        {options.map((option) => (
                            <ListboxOption
                                key={option.value}
                                value={option.value}
                                className={({ focus }) =>
                                    cn(
                                        "relative cursor-pointer select-none py-2 pl-10 pr-4 transition-colors focus:outline-none",
                                        focus ? "bg-surface-muted text-foreground" : "text-foreground"
                                    )
                                }
                            >
                                {({ selected: isSelected }) => (
                                    <>
                                        <span className={cn("block truncate", isSelected ? "font-semibold text-brand" : "font-normal")}>
                                            {option.label}
                                        </span>
                                        {isSelected && (
                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-brand">
                                                <Check className="h-4 w-4" aria-hidden="true" />
                                            </span>
                                        )}
                                    </>
                                )}
                            </ListboxOption>
                        ))}
                    </ListboxOptions>
                </div>
            </Listbox>
        </div>
    );
}