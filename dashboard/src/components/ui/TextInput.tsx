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
                    "w-full rounded-md border px-3 py-2 text-sm transition-colors",
                    "bg-surface text-foreground placeholder:text-muted-foreground focus-ring",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
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

TextInput.displayName = "TextInput";