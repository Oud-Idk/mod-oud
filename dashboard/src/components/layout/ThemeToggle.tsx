"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { JSX } from "react";
import { Button } from "@/components/ui/inputs/Button";

export function ThemeToggle(): JSX.Element {
    const { setTheme, resolvedTheme } = useTheme();
    // Avoid hydration mismatch by waiting for client-side mount
    const mounted = React.useSyncExternalStore(
        () => (): void => undefined,
        () => true,
        () => false
    );

    if (!mounted) {
        return <div className="w-10 h-10"/>;
    }

    const isDark = resolvedTheme === "dark";

    return (
        <Button
            variant="secondary"
            onClick={() => { setTheme(isDark ? "light" : "dark"); }} className="p-2" aria-label="Toggle Theme"
        >
            {isDark ? (
                <Sun className="h-5 w-5 text-yellow-500"/>
            ) : (
                <Moon className="h-5 w-5 text-slate-700"/>
            )}
        </Button>
    );
}