import React, { JSX } from "react";
import * as Slider from "@radix-ui/react-slider";
import { cn } from "@/lib/cn";

interface PercentSliderProps {
    value: number;
    onChange: (value: number) => void;
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    className?: string;
}

export function PercentSlider({
    value,
    onChange,
    label,
    min = 0,
    max = 1,
    step = 0.01,
    disabled = false,
    className,
}: PercentSliderProps): JSX.Element {
    const percentageDisplay = `${Math.round(value * 100)}%`;

    return (
        <div className={cn("flex flex-col gap-2 w-full max-w-md", disabled && "opacity-50 pointer-events-none", className)}>
            {(label || value !== undefined) && (
                <div className="flex justify-between items-center text-sm">
                    {label && (
                        <span className="font-medium text-foreground">{label}</span>
                    )}
                    <span className="font-mono text-xs font-semibold text-muted-foreground px-2 py-0.5 rounded bg-surface-muted border border-border-subtle">
                        {percentageDisplay}
                    </span>
                </div>
            )}

            <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-2 cursor-pointer disabled:cursor-not-allowed"
                value={[value]}
                onValueChange={(values) => onChange(values[0])}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
            >
                <Slider.Track className="bg-surface-active relative grow rounded-full h-1.5 overflow-hidden">
                    <Slider.Range className="absolute rounded-full h-full bg-brand" />
                </Slider.Track>

                <Slider.Thumb
                    className={cn(
                        "block w-4 h-4 bg-surface border-2 border-brand rounded-full shadow-sm",
                        "hover:scale-110 active:scale-95 transition-transform duration-150",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    )}
                    aria-label={label || "Percentage"}
                />
            </Slider.Root>
        </div>
    );
}