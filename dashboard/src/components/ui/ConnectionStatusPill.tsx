"use client";

import { cn } from "@/lib/cn";

export interface ConnectionStatusPillProps {
    status: "CONNECTED" | "DISCONNECTED" | string;
    connectedText?: string;
    disconnectedText?: string;
    className?: string;
}

export function ConnectionStatusPill({
    status,
    connectedText = "Live Stream",
    disconnectedText = "Disconnected",
    className,
}: ConnectionStatusPillProps) {
    const isConnected = status === "CONNECTED";

    return (
        <div
            className={cn(
                "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-300 select-none",
                isConnected
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/30",
                className
            )}
        >
            <span className="relative flex h-2 w-2">
                {isConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                    className={cn(
                        "relative inline-flex rounded-full h-2 w-2 transition-all",
                        isConnected
                            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                            : "bg-rose-500"
                    )}
                />
            </span>
            <span>{isConnected ? connectedText : disconnectedText}</span>
        </div>
    );
}