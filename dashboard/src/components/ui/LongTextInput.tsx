import React, { forwardRef, TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export interface LongTextInputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    error?: boolean;
}

export const LongTextInput = forwardRef<HTMLTextAreaElement, LongTextInputProps>(
    ({ className, error, rows = 3, ...props }, ref) => {
        return (
            <textarea
                ref={ref}
                rows={rows}
                aria-invalid={error ? true : undefined}
                className={twMerge(
                    // Layout & Base Typography
                    "w-full rounded-md border p-2.5 text-sm transition-colors resize-none",

                    // Surface & Text colors (Adapts to Light/Dark Mode)
                    "bg-surface text-foreground placeholder:text-muted-foreground",

                    // Focus Ring State
                    "focus:outline-none focus:ring-2 focus:ring-focus-ring focus:border-brand",

                    // Disabled State
                    "disabled:opacity-50 disabled:cursor-not-allowed",

                    // Default vs Error State
                    error
                        ? "border-danger-border focus:border-danger-border focus:ring-danger/30"
                        : "border-border",

                    className
                )}
                {...props}
            />
        );
    }
);

LongTextInput.displayName = "LongTextInput";