import React, { forwardRef, InputHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
    error?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
    ({ className, error, ...props }, ref) => {
        return (
            <input
                ref={ref}
                type="text"
                className={twMerge(
                    "w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-neutral-300/10 placeholder:text-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed",
                    error ? "border-red-500 focus:border-red-500" : "border-neutral-500 focus:border-blue-500",
                    className
                )}
                {...props}
            />
        );
    }
);

TextInput.displayName = "TextInput";