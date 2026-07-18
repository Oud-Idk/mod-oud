"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronsUpDown } from "lucide-react";
import { twMerge } from "tailwind-merge";

export interface DropdownOption {
    value: string;
    label: string;
}

interface BaseDropdownProps {
    options: DropdownOption[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

// Props signature when multiple-selection is disabled
interface SingleDropdownProps extends BaseDropdownProps {
    multiple?: false;
    value: string;
    onChange: (value: string) => void;
}

// Props signature when multiple-selection is enabled
interface MultiDropdownProps extends BaseDropdownProps {
    multiple: true;
    value: string[];
    onChange: (value: string[]) => void;
}

export type DropdownProps = SingleDropdownProps | MultiDropdownProps;

export function Dropdown({
    options,
    value,
    onChange,
    placeholder = "Select an option",
    disabled,
    className = "",
    multiple = false,
}: DropdownProps) {
    // Resolve which labels to display depending on select mode
    const selectedLabels = multiple
        ? options
            .filter((opt) => Array.isArray(value) && value.includes(opt.value))
            .map((opt) => opt.label)
        : [options.find((opt) => opt.value === value)?.label].filter(Boolean) as string[];

    const hasSelection = selectedLabels.length > 0;
    const displayText = hasSelection ? selectedLabels.join(", ") : placeholder;

    return (
        <div className={twMerge(`w-full relative`, className)}>
            <Listbox
                value={value} disabled={disabled} onChange={onChange as any} multiple={multiple}
            >
                <div className="relative">
                    <ListboxButton
                        className={twMerge("relative w-full cursor-pointer rounded-md border border-neutral-500 bg-neutral-300/10 py-2 pl-3 pr-10 min-h-full text-left text-sm disabled:cursor-not-allowed disabled:opacity-50", className)}
                    >
                        <span className={`block truncate font-medium ${!hasSelection && 'text-neutral-500'}`}>
                            {displayText}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <ChevronsUpDown className="h-4 w-4 text-neutral-400" aria-hidden="true"/>
                        </span>
                    </ListboxButton>

                    <ListboxOptions
                        anchor="bottom start"
                        className="z-50 max-h-60 w-(--button-width) overflow-auto rounded-md bg-white py-1 text-sm shadow-[0px_0px_10px_-2px_rgba(0,0,0,0.5)] dark:bg-neutral-900 focus:outline-none [--anchor-gap:4px]"
                    >
                        {options.map((option) => (
                            <ListboxOption
                                key={option.value} value={option.value} className={({ focus }) =>
                                `relative cursor-pointer select-none py-2 pl-10 pr-4 transition-colors focus:outline-none ${
                                    focus
                                        ? "bg-neutral-300/10 dark:text-white text-black"
                                        : "text-neutral-900 dark:text-neutral-200"
                                }`
                            }
                            >
                                {({ selected: isSelected }) => (
                                    <>
                                        <span
                                            className={`block truncate ${isSelected ? "font-semibold" : "font-normal"}`}
                                        >
                                            {option.label}
                                        </span>
                                        {isSelected && (
                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                                <Check className="h-4 w-4" aria-hidden="true"/>
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