import { ReactNode, JSX } from "react";
import { InputLabel } from "@/components/layout/InputLabel";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T> {
    value: T;
    label: ReactNode;
    disabled?: boolean;
}

export interface SegmentedControlProps<T> {
    value: T;
    options: SegmentedOption<T>[];
    onChange: (value: T) => void;
    label?: string;
    disabled?: boolean;
    error?: boolean; // Added for design system parity
    className?: string;
}

export function SegmentedControl<T extends string | number | boolean>({
    value,
    options,
    onChange,
    label,
    disabled = false,
    error = false,
    className,
}: SegmentedControlProps<T>): JSX.Element {
    return (
        <div className={className}>
            {label && <InputLabel className="block mb-1.5">{label}</InputLabel>}
            <div
                role="radiogroup"
                aria-invalid={error ? true : undefined}
                className={cn(
                    // Outer track: muted background gives contrast to active pill
                    "inline-flex items-center gap-1 p-0.5 rounded-lg border bg-surface w-fit transition-colors",
                    error ? "border-danger-border" : "border-border"
                )}
            >
                {options.map((option) => {
                    const isSelected = value === option.value;
                    const isDisabled = disabled || option.disabled;
                    return (
                        <button
                            key={String(option.value)}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            disabled={isDisabled}
                            onClick={() => onChange(option.value)}
                            className={cn(
                                // Base Typography & Layout
                                "px-3 py-1.5 rounded-md text-xs font-medium transition-all select-none shrink-0 focus-ring",

                                // Active Pill (Elevated surface + subtle shadow) vs Inactive Pill
                                isSelected
                                    ? "bg-surface-muted text-foreground font-semibold shadow-xs border border-border/50"
                                    : "border border-transparent text-muted-foreground hover:text-foreground",

                                // Disabled State
                                isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                            )}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}