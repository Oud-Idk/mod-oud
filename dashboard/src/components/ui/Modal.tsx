"use client";

import React, { ReactNode, useEffect } from "react";
import { cn } from "@/lib/cn";

interface ModalProps {
    children: ReactNode;
    onClose: () => void;
    headerText: string;
    className?: string;
}

export function Modal({ children, onClose, headerText, className }: ModalProps) {
    // Esc Key listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    // Close only when clicking outside the modal boundary
    const onBgClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
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
                    "bg-surface border border-border rounded-xl max-w-xl w-full overflow-hidden shadow-dropdown py-6 px-6 transition-all duration-150 animate-in fade-in zoom-in-95",
                    className
                )}
            >
                <div className="flex justify-between items-center gap-4 border-border-subtle">
                    <h3 className="text-lg font-bold text-foreground truncate">
                        {headerText}
                    </h3>
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
                </div>

                <div className="mt-2 text-sm text-foreground">
                    {children}
                </div>
            </div>
        </div>
    );
}