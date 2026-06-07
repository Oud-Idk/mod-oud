import type { Metadata } from "next";
import { ThemeProvider } from "@/context/ThemeProvider";
import { SessionProvider } from "@/context/SessionProvider";
import "./globals.css";
import React from "react";

export const metadata: Metadata = {
    title: "Mod Oud Dashboard",
    description: "Manage your Discord Bot",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
        <body
            className="dark:bg-black bg-white dark:text-white text-black transition-colors h-dvh">
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <SessionProvider>
                {children}
            </SessionProvider>
        </ThemeProvider>
        </body>
        </html>
    );
}