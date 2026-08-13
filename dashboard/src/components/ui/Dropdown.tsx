"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type React from "react";
import type { ReactElement } from "react";

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

export function Dropdown<T extends string>(props: DropdownProps<T>): ReactElement {
    const {
        options,
        placeholder = "Select an option",
        disabled,
        error,
        className,
    } = props;

    const selectedLabels: string[] = props.multiple
        ? options
            .filter((opt: DropdownOption<T>): boolean => props.value.includes(opt.value))
            .map((opt: DropdownOption<T>): string => opt.label)
        : options
            .filter((opt: DropdownOption<T>): boolean => opt.value === props.value)
            .map((opt: DropdownOption<T>): string => opt.label);

    const hasSelection: boolean = selectedLabels.length > 0;
    const displayText: string = hasSelection ? selectedLabels.join(", ") : placeholder;

    const handleClear = (e: React.MouseEvent<HTMLButtonElement>): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!props.multiple) {
            props.onChange(null);
        }
    };

    const renderContent = (): ReactElement => (
        <div className="relative">
            <ListboxButton
                aria-invalid={error ? true : undefined}
                className={cn(
                    "relative w-full cursor-pointer rounded-md border bg-surface py-2 pl-3 pr-10 text-left text-sm transition-all duration-150",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "focus:outline-none focus-visible:ring-2 focus-visible:border-brand",
                    error
                        ? "border-danger-border"
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

            {!props.multiple && props.allowClear && hasSelection && !disabled && (
                <div className="absolute inset-y-0 right-7 z-10 flex items-center">
                    <button
                        type="button"
                        onClick={handleClear}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground focus:outline-none"
                        aria-label="Clear selection"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </div>
            )}

            <ListboxOptions
                anchor="bottom start"
                transition
                className={cn(
                    "z-50 max-h-60 w-(--button-width) overflow-auto rounded-md bg-surface-elevated py-1 text-sm border border-border shadow-dropdown [--anchor-gap:4px]",
                    "focus:outline-none",
                    "transition duration-100 ease-out data-closed:scale-95 data-closed:opacity-0"
                )}
            >
                {options.map((option: DropdownOption<T>): ReactElement => (
                    <ListboxOption
                        key={option.value}
                        value={option.value}
                        className={({ focus }: { focus: boolean }): string =>
                            cn(
                                "relative cursor-pointer select-none py-2 pl-10 pr-4 transition-colors focus:outline-none",
                                focus ? "bg-surface-muted text-foreground" : "text-foreground"
                            )
                        }
                    >
                        {({ selected: isSelected }): ReactElement => (
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
    );

    return (
        <div className={cn("w-full relative", className)}>
            {props.multiple ? (
                <Listbox value={props.value} disabled={disabled} onChange={props.onChange} multiple={true}>
                    {renderContent()}
                </Listbox>
            ) : (
                <Listbox value={props.value ?? null} disabled={disabled} onChange={props.onChange} multiple={false}>
                    {renderContent()}
                </Listbox>
            )}
        </div>
    );
}