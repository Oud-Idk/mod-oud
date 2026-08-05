import React, { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
    error?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
    ({ className, error, ...props }, ref) => {
        return (
            <input
                ref={ref}
                type="text"
                aria-invalid={error ? true : undefined}
                className={cn(
                    // Base Layout & Typography
                    "w-full rounded-md border px-3 py-2 text-sm transition-colors",

                    // Surface & Text colors
                    "bg-surface text-foreground placeholder:text-muted-foreground",

                    // Standard Focus State
                    "focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-brand",

                    // Disabled State
                    "disabled:opacity-50 disabled:cursor-not-allowed",

                    // Default vs Error State mapping
                    error
                        ? "border-danger focus:border-danger focus:ring-danger/30"
                        : "border-border",

                    className
                )}
                {...props}
            />
        );
    }
);

TextInput.displayName = "TextInput";