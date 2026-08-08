import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/context/ThemeProvider";
import { SessionProvider } from "@/context/SessionProvider";
import "./globals.css";
import React from "react";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter", // Variable name passed to CSS
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-mono", // Variable name passed to CSS
});

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
        <html
            lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}
        >
        <body
            className="dark:bg-black bg-white dark:text-white text-black transition-colors h-dvh font-sans antialiased"
        >
        <ThemeProvider
            attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange
        >
            <SessionProvider>
                {children}
            </SessionProvider>
            <Toaster
                position="top-right"
                toastOptions={{
                    classNames: {
                        toast:
                            'bg-surface-elevated text-foreground border-border shadow-dropdown',
                        title: 'text-foreground font-medium text-base',
                        description: 'text-muted-foreground',
                        actionButton:
                            'bg-brand text-brand-foreground hover:bg-brand-hover transition-colors rounded-lg px-3 py-1.5 text-xs font-medium',
                        cancelButton:
                            'bg-surface-muted text-foreground hover:bg-surface-active transition-colors rounded-lg px-3 py-1.5 text-xs font-medium',
                        closeButton:
                            'bg-surface-elevated text-muted-foreground border-border hover:text-foreground hover:bg-surface-muted transition-colors',

                        error:
                            '!bg-danger-subtle !text-danger !border-danger-border',
                        success:
                            '!bg-success-subtle !text-success !border-success/30',
                        warning:
                            '!bg-warning-subtle !text-warning !border-warning/30',
                        info:
                            '!bg-info-subtle !text-info !border-info/30',
                    },
                }}
            />
        </ThemeProvider>
        </body>
        </html>
    );
}