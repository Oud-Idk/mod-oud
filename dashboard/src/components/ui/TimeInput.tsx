import React, { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TimeInputProps extends InputHTMLAttributes<HTMLInputElement> {
    error?: boolean;
}

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(
    ({ className, error, ...props }, ref) => {
        return (
            <input
                ref={ref}
                type="time"
                aria-invalid={error ? true : undefined}
                className={cn(
                    "w-full rounded-md border px-3 py-2 text-sm transition-colors focus-ring",
                    "bg-surface text-foreground placeholder:text-muted-foreground",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100",
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

TimeInput.displayName = "TimeInput";