import { Button, Field, Input, Label } from "@headlessui/react";
import React from "react";
import { twMerge } from "tailwind-merge";

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
    placeholder?: string;
}

export function NumberInput({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    className = "",
    disabled = false,
    required = true,
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
        if (isEmpty) return; // Allow empty state so the browser's required validation can trigger

        if (value < min) onChange(min);
        if (value > max) onChange(max);
    };

    return (
        <Field className={twMerge(`flex flex-col gap-1.5 w-full`, className)}>
            {label && (
                <Label className={`text-sm ${disabled ? "text-neutral-400" : ""}`}>
                    {label}
                    {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
                </Label>
            )}

            <div
                className={twMerge(`flex items-center border border-neutral-500 rounded-lg overflow-hidden bg-neutral-300/10 max-w-35 transition-opacity ${
                    disabled ? "opacity-50 cursor-not-allowed" : ""
                }`, className)}
            >
                <Button
                    type="button"
                    onClick={decrement}
                    disabled={disabled || (!isEmpty && value <= min)}
                    className="px-3 py-2 hover:bg-neutral-300/30 disabled:opacity-50 disabled:hover:bg-transparent transition-colors border-r border-neutral-500 font-medium select-none cursor-pointer"
                >
                    &minus;
                </Button>

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
                    className="w-full text-center bg-transparent border-0 py-2 focus:outline-0 dark:text-white text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:cursor-not-allowed"
                />

                <Button
                    type="button"
                    onClick={increment}
                    disabled={disabled || (!isEmpty && value >= max)}
                    className="px-3 py-2 hover:bg-neutral-300/15 disabled:opacity-50 disabled:hover:bg-transparent transition-colors border-l border-neutral-500 font-medium select-none cursor-pointer"
                >
                    +
                </Button>
            </div>
        </Field>
    );
}