"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { JSX } from "react";
import { Button } from "@/components/ui/Button";

export function ThemeToggle(): JSX.Element {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Avoid hydration mismatch by waiting for client-side mount
    React.useEffect(() => {
        setMounted(true);
    }, []);

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