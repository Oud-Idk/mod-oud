import { Button, Field, Input, Label } from "@headlessui/react";
import React from "react";
import { cn } from "@/lib/cn";
import { InputLabel } from "@/components/layout/InputLabel";

interface NumberInputProps {
    value: number | undefined | null; // Accepts undefined or null from DB/parent
    onChange: (value: number | undefined) => void; // Emits number or undefined
    min?: number;
    max?: number;
    step?: number;
    clamp?: boolean; // Set to true to enforce min/max on blur (default: false)
    label?: string;
    className?: string;
    disabled?: boolean;
    required?: boolean;
    error?: boolean;
    placeholder?: string;
}

export function NumberInput({
    value,
    onChange,
    min,
    max,
    step = 1,
    clamp = false,
    label,
    className,
    disabled = false,
    required = false,
    error = false,
    placeholder = "",
}: NumberInputProps) {
    // Helper to check if the value is empty
    const isEmpty = value === undefined || value === null;

    // The raw string value used purely by the HTML input element
    const displayValue = isEmpty ? "" : value;

    const increment = () => {
        if (disabled) return;
        const base = isEmpty ? (min ?? 0) : value;
        const next = base + step;

        if (max !== undefined && clamp) {
            onChange(Math.min(max, next));
        } else {
            onChange(next);
        }
    };

    const decrement = () => {
        if (disabled) return;
        const base = isEmpty ? (min ?? 0) : value;
        const next = base - step;

        if (min !== undefined && clamp) {
            onChange(Math.max(min, next));
        } else {
            onChange(next);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (disabled) return;

        const rawValue = e.target.value;
        if (rawValue === "") {
            onChange(undefined); // Emit undefined back to parent
            return;
        }

        const val = parseFloat(rawValue);
        if (!isNaN(val)) {
            onChange(val);
        }
    };

    const handleBlur = () => {
        if (disabled || isEmpty || !clamp) return;

        if (min !== undefined && value < min) onChange(min);
        if (max !== undefined && value > max) onChange(max);
    };

    const isAtMin = min !== undefined && !isEmpty && value <= min;
    const isAtMax = max !== undefined && !isEmpty && value >= max;

    return (
        <Field className={cn("flex flex-col w-full", className)}>
            {label && (
                <InputLabel className={cn(disabled ? "text-muted-foreground" : "text-foreground")}>
                    {label}
                    {required && <span className="text-danger ml-1" aria-hidden="true">*</span>}
                </InputLabel>
            )}

            <div
                className={cn(
                    "flex items-center w-full rounded-md border bg-surface overflow-hidden transition-all duration-150",
                    error ? "border-danger" : "border-border",
                    disabled && "opacity-50 cursor-not-allowed bg-surface-muted"
                )}
            >
                {/* Decrement Button */}
                <Button
                    type="button"
                    onClick={decrement}
                    disabled={disabled || (clamp && isAtMin)}
                    className={cn(
                        "px-3 py-1 text-muted-foreground hover:text-foreground hover:bg-surface-active font-medium select-none cursor-pointer border-r border-border transition-colors shrink-0 focus-ring rounded-md ml-0.5",
                        "disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    )}
                    aria-label="Decrement"
                >
                    &minus;
                </Button>

                {/* Number Input */}
                <Input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={displayValue}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    disabled={disabled}
                    required={required}
                    placeholder={placeholder}
                    className={cn(
                        "flex-1 min-w-0 w-full text-center bg-transparent border-0 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none",
                        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        "disabled:cursor-not-allowed"
                    )}
                />

                {/* Increment Button */}
                <Button
                    type="button"
                    onClick={increment}
                    disabled={disabled || (clamp && isAtMax)}
                    className={cn(
                        "px-3 py-1 text-muted-foreground hover:text-foreground hover:bg-surface-active font-medium select-none cursor-pointer border-l border-border transition-colors shrink-0 focus-ring rounded-md mr-0.5",
                        "disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    )}
                    aria-label="Increment"
                >
                    +
                </Button>
            </div>
        </Field>
    );
}