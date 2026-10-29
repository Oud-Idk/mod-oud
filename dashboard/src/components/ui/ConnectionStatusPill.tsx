"use client";

import { cn } from "@/lib/cn";
import { JSX } from "react";

export interface ConnectionStatusPillProps {
    status: string;
    connectedText?: string;
    disconnectedText?: string;
    className?: string;
}

export function ConnectionStatusPill({
    status,
    connectedText = "Live Stream",
    disconnectedText = "Disconnected",
    className,
}: ConnectionStatusPillProps): JSX.Element {
    const isConnected = status === "CONNECTED";

    return (
        <div
            className={cn(
                "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-300 select-none",
                isConnected
                    ? "text-success border-success/30"
                    : "text-danger border-danger/30",
                className
            )}
        >
            <span className="relative flex h-2 w-2">
                <span
                    className={cn(
                        "relative inline-flex rounded-full h-2 w-2 transition-all",
                        isConnected
                            ? "bg-success"
                            : "bg-danger"
                    )}
                />
            </span>
            <span>{isConnected ? connectedText : disconnectedText}</span>
        </div>
    );
}