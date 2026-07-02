import React from "react";
import { twMerge } from "tailwind-merge";

interface TextInputProps {
    // Changed: onSubmit no longer receives a FormEvent, just a simple callback
    onSubmit?: () => void;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
    disableSubmitButton?: boolean;
}

export function TextInput({
    onSubmit,
    value,
    onChange,
    placeholder,
    className,
    disableSubmitButton = false,
}: TextInputProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && onSubmit) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <div className={twMerge("flex gap-2 max-w-xs", className)}>
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                onKeyDown={handleKeyDown}
                className="border rounded px-3 py-2 text-sm focus:outline-none flex-1 placeholder-neutral-500 bg-neutral-300/10 border-neutral-500"
            />
            {!disableSubmitButton && (
                <button
                    type="button"
                    onClick={onSubmit}
                    className="px-3 py-1.5 text-sm bg-gray-850 rounded cursor-pointer border hover:bg-neutral-300/10"
                >
                    Add </button>
            )}
        </div>
    );
}