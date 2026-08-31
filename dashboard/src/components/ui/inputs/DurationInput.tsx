import React, { useState, useEffect, JSX } from "react";
import { cn } from "@/lib/cn";

export interface DurationInputProps {
    value?: number; // Total duration in seconds
    onChange?: (totalSeconds: number) => void;
    error?: boolean;
    disabled?: boolean;
    className?: string;
    showSeconds?: boolean; // Set to false if you only want HH:MM
}

interface TimeParts {
    hours: string;
    minutes: string;
    seconds: string;
}

const toTimeParts = (total: number): TimeParts => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return {
        hours: h > 0 ? String(h).padStart(2, "0") : "00",
        minutes: String(m).padStart(2, "0"),
        seconds: String(s).padStart(2, "0"),
    };
};

export const DurationInput = ({
    value = 0,
    onChange,
    error,
    disabled,
    className,
    showSeconds = true,
}: DurationInputProps): JSX.Element => {
    const [parts, setParts] = useState<TimeParts>(() => toTimeParts(value));

    useEffect(() => {
        setParts(toTimeParts(value));
    }, [value]);

    const updateValue = (newHours: string, newMinutes: string, newSeconds: string): void => {
        const hoursStr = newHours.trim() === "" ? "0" : newHours;
        const minutesStr = newMinutes.trim() === "" ? "0" : newMinutes;
        const secondsStr = newSeconds.trim() === "" ? "0" : newSeconds;

        const h = Math.max(0, parseInt(hoursStr, 10));
        const m = Math.min(59, Math.max(0, parseInt(minutesStr, 10)));
        const s = Math.min(59, Math.max(0, parseInt(secondsStr, 10)));

        const total = h * 3600 + m * 60 + s;
        if (onChange !== undefined) {
            onChange(total);
        }
    };

    const handleChange = (field: "hours" | "minutes" | "seconds", val: string): void => {
        const sanitized = val.replace(/\D/g, "").slice(0, field === "hours" ? 3 : 2);

        const nextParts: TimeParts = { ...parts, [field]: sanitized };
        setParts(nextParts);
        updateValue(nextParts.hours, nextParts.minutes, nextParts.seconds);
    };

    const handleBlur = (field: "hours" | "minutes" | "seconds"): void => {
        setParts((prev) => ({
            ...prev,
            [field]: prev[field].padStart(2, "0"),
        }));
    };

    return (
        <div
            className={cn(
                "inline-flex items-center w-full rounded-md border px-3 py-2 text-sm transition-colors",
                "bg-surface text-foreground focus-ring",
                disabled === true && "opacity-50 cursor-not-allowed",
                error === true
                    ? "border-danger-border focus-within:border-danger-border focus-within:ring-danger/30"
                    : "border-border",
                className
            )}
        >
            <div className="flex items-center">
                <input
                    type="text"
                    inputMode="numeric"
                    placeholder="00"
                    disabled={disabled}
                    value={parts.hours}
                    onChange={(e) => { handleChange("hours", e.target.value); }}
                    onBlur={() => { handleBlur("hours"); }}
                    className="w-8 bg-transparent text-center outline-none placeholder:text-muted-foreground"
                />
                <span className="text-xs text-muted-foreground mr-1">h</span>
            </div>

            <span className="text-muted-foreground font-bold px-0.5">:</span>

            <div className="flex items-center">
                <input
                    type="text"
                    inputMode="numeric"
                    placeholder="00"
                    disabled={disabled}
                    value={parts.minutes}
                    onChange={(e) => { handleChange("minutes", e.target.value); }}
                    onBlur={() => { handleBlur("minutes"); }}
                    className="w-7 bg-transparent text-center outline-none placeholder:text-muted-foreground"
                />
                <span className="text-xs text-muted-foreground mr-1">m</span>
            </div>

            {showSeconds && (
                <>
                    <span className="text-muted-foreground font-bold px-0.5">:</span>
                    <div className="flex items-center">
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="00"
                            disabled={disabled}
                            value={parts.seconds}
                            onChange={(e) => { handleChange("seconds", e.target.value); }}
                            onBlur={() => { handleBlur("seconds"); }}
                            className="w-7 bg-transparent text-center outline-none placeholder:text-muted-foreground"
                        />
                        <span className="text-xs text-muted-foreground">s</span>
                    </div>
                </>
            )}
        </div>
    );
};