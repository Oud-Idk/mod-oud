import { Button, Field, Input, Label } from "@headlessui/react";
import React from "react";
import { cn } from "@/lib/cn";

interface NumberInputProps {
    value: number | undefined | null; // Accepts undefined or null from DB/parent
    onChange: (value: number | undefined) => void; // Emits number or undefined
    min?: number;
    max?: number;
    step?: number;
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
    min = 0,
    max = 100,
    step = 1,
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
        const currentValue = isEmpty ? min : value;
        onChange(Math.min(max, currentValue + step));
    };

    const decrement = () => {
        if (disabled) return;
        const currentValue = isEmpty ? min : value;
        onChange(Math.max(min, currentValue - step));
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
        if (disabled) return;
        if (isEmpty) return; // Allow empty state so browser validation works

        if (value < min) onChange(min);
        if (value > max) onChange(max);
    };

    return (
        <Field className={cn("flex flex-col gap-1.5 w-full", className)}>
            {label && (
                <Label className={cn("text-sm font-medium", disabled ? "text-muted-foreground" : "text-foreground")}>
                    {label}
                    {required && <span className="text-danger ml-1" aria-hidden="true">*</span>}
                </Label>
            )}

            <div
                className={cn(
                    "flex items-center w-full rounded-md border bg-surface overflow-hidden transition-all duration-150",
                    "focus-within:outline-none focus-within:ring-2",
                    error
                        ? "border-danger focus-within:ring-danger/20"
                        : "border-border focus-within:ring-focus-ring focus-within:border-brand",
                    disabled && "opacity-50 cursor-not-allowed bg-surface-muted"
                )}
            >
                {/* Decrement Button */}
                <Button
                    type="button"
                    onClick={decrement}
                    disabled={disabled || (!isEmpty && value <= min)}
                    className={cn(
                        "px-3 py-1 text-muted-foreground hover:text-foreground hover:bg-surface-active font-medium select-none cursor-pointer border-r border-border transition-colors shrink-0",
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
                    disabled={disabled || (!isEmpty && value >= max)}
                    className={cn(
                        "px-3 py-1 text-muted-foreground hover:text-foreground hover:bg-surface-active font-medium select-none cursor-pointer border-l border-border transition-colors shrink-0",
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