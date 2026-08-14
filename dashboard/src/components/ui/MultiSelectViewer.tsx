import React, { JSX } from "react";
import { cn } from "@/lib/cn";

interface MultiSelectViewerProps {
    selectedList: string[];
    onDelete: (id: string) => void;
    map?: Record<string, string>;
    placeholder?: string;
    prefix?: string;
    className?: string;
}

export function MultiSelectViewer({
    selectedList,
    onDelete,
    map,
    placeholder,
    prefix,
    className,
}: MultiSelectViewerProps): JSX.Element | null {
    if (selectedList.length === 0) {return null}

    return (
        <div className={cn("flex flex-wrap gap-2 mb-1", className)}>
            {selectedList.map((item) => {
                const labelText = map ? map[item] : item;
                const displayText = prefix
                    ? `${prefix}${labelText.replace(prefix, "")}`
                    : labelText;

                return (
                    <span
                        key={item}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-surface-muted border border-border text-foreground transition-colors"
                    >
                        <span className="truncate max-w-50">{displayText}</span>
                        <button
                            type="button"
                            onClick={() =>{  onDelete(item); }}
                            className="text-muted-foreground hover:text-danger hover:bg-danger-subtle rounded p-0.5 py-1 transition-colors cursor-pointer -mr-0.5 shrink-0 focus-ring"
                            aria-label={`Remove ${displayText}`}
                        >
                            <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </span>
                );
            })}

            {selectedList.length === 0 && placeholder && (
                <span className="text-xs italic text-muted-foreground py-1">
                    {placeholder}
                </span>
            )}
        </div>
    );
}