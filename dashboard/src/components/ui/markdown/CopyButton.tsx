"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';

export function CopyButton({ code }: { code?: string }): JSX.Element {
    const [isCopied, setIsCopied] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Clear the pending reset on unmount so a code block scrolled away mid-timeout
    // doesn't schedule state on a dead component.
    useEffect((): (() => void) => {
        return (): void => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const handleCopy = useCallback(async (): Promise<void> => {
        if (code === undefined || code === "") return;
        try {
            await navigator.clipboard.writeText(code);
            setIsCopied(true);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout((): void => {
                setIsCopied(false);
            }, 2000);
        } catch (err) {
            console.error("Failed to copy code: ", err);
        }
    }, [code]);

    return (
        <button
            onClick={() => {
                void handleCopy();
            }}
            aria-label="Copy code"
            type="button"
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-surface rounded-md text-xs font-sans text-muted-foreground hover:text-foreground hover:bg-surface-active border border-border-subtle transition-all focus-ring"
        >
            {isCopied ? (
                <>
                    <CheckIcon className="h-3.5 w-3.5 text-success" />
                    <span className="text-success font-medium">Copied!</span>
                </>
            ) : (
                <>
                    <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    <span>Copy</span>
                </>
            )}
        </button>
    );
}
