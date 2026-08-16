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
                    ? "bg-success-subtle border-success/30"
                    : "bg-danger-subtle border-danger/30",
                className
            )}
        >
            <span className="relative flex h-2 w-2">
                {isConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                )}
                <span
                    className={cn(
                        "relative inline-flex rounded-full h-2 w-2 transition-all",
                        isConnected
                            ? "bg-success shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                            : "bg-danger"
                    )}
                />
            </span>
            <span>{isConnected ? connectedText : disconnectedText}</span>
        </div>
    );
}