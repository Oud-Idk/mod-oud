"use client";

import React, { JSX, ReactNode, useEffect } from "react";
import { cn } from "@/lib/cn";

interface ModalProps {
    children: ReactNode;
    onClose?: () => void;
    headerText?: string;
    className?: string;
    uncloseable?: boolean;
}

export function Modal({
    children,
    onClose,
    headerText,
    className,
    uncloseable = false
}: ModalProps): JSX.Element {
    // Esc Key listener (disabled if uncloseable)
    useEffect(() => {
        if (uncloseable) return;

        const handleKeyDown = (e: KeyboardEvent): void => {
            if (e.key === "Escape" && onClose) {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose, uncloseable]);

    // Close only when clicking outside the modal boundary (if permitted!)
    const onBgClick = (e: React.MouseEvent<HTMLDivElement>): void => {
        if (!uncloseable && e.target === e.currentTarget && onClose) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-xs"
            onClick={onBgClick}
        >
            <div
                className={cn(
                    "bg-surface border border-border rounded-xl max-w-xl w-full overflow-hidden shadow-dropdown py-6 px-6 transition-all duration-150 animate-in fade-in zoom-in-95 max-h-150 flex flex-col",
                    className
                )}
            >
                <div className="flex justify-between items-center gap-4 border-border-subtle shrink-0">
                    <h3 className="text-lg font-bold text-foreground truncate">
                        {headerText}
                    </h3>

                    {/* The illusion of free will is revoked */}
                    {!uncloseable && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground hover:bg-surface-active rounded-md p-1 transition-all cursor-pointer shrink-0"
                            aria-label="Close modal"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Added: "flex-1 min-h-0 overflow-y-auto" */}
                <div className="mt-4 text-sm text-foreground flex-1 min-h-0 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}