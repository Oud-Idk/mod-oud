"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { JSX } from "react";

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>): JSX.Element {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}