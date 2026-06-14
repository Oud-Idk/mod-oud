import { Field, Label } from "@headlessui/react";
import React from "react";

interface NumberInputProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
}

export function NumberInput({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
}: NumberInputProps) {

    const increment = () => {
        onChange(Math.min(max, value + step));
    };

    const decrement = () => {
        onChange(Math.max(min, value - step));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
            onChange(val);
        }
    };

    const handleBlur = () => {
        // If the user manually types a value outside the bounds, clamp it on blur
        if (value < min) onChange(min);
        if (value > max) onChange(max);
    };

    return (
        <Field className="flex flex-col gap-1.5 w-full">
            {label && (
                <Label className="text-sm font-medium">
                    {label}
                </Label>
            )}

            <div className="flex items-center border border-neutral-500 rounded-lg overflow-hidden bg-neutral-300/10 max-w-35">
                {/* Decrement Button */}
                <button
                    type="button"
                    onClick={decrement}
                    disabled={value <= min}
                    className="px-3 py-2 hover:bg-neutral-300/30 disabled:opacity-50 disabled:hover:bg-transparent transition-colors border-r border-neutral-500 font-medium select-none cursor-pointer"
                >
                    &minus;
                </button>

                {/* Number Input (Chrome/Safari/Firefox default arrows hidden via CSS classes) */}
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    className="w-full text-center bg-transparent border-0 py-2 focus:outline-0 dark:text-white text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />

                {/* Increment Button */}
                <button
                    type="button"
                    onClick={increment}
                    disabled={value >= max}
                    className="px-3 py-2 hover:bg-neutral-300/15 disabled:opacity-50 disabled:hover:bg-transparent transition-colors border-l border-neutral-500 font-medium select-none cursor-pointer"
                >
                    +
                </button>
            </div>
        </Field>
    );
}