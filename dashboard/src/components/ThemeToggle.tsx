"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Avoid hydration mismatch by waiting for client-side mount
    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        // Return an empty element of the exact same dimensions to avoid layout shifting
        return <div className="w-10 h-10"/>;
    }

    const isDark = resolvedTheme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="p-2 rounded-lg border transition-colors cursor-pointer"
            aria-label="Toggle Theme"
        >
            {isDark ? (
                <Sun className="h-5 w-5 text-yellow-500"/>
            ) : (
                <Moon className="h-5 w-5 text-slate-700"/>
            )}
        </button>
    );
}