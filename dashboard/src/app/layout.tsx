import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/context/ThemeProvider";
import { SessionProvider } from "@/context/SessionProvider";
import "./globals.css";
import React, { JSX } from "react";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    title: {
        template: "%s | Mod Oud",
        default: "Mod Oud — Discord Bot Dashboard",
    },
    description: "Blazingly fast, modern moderation & engagement management for Discord communities.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}): JSX.Element {
    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={`${inter.variable} ${jetbrainsMono.variable}`}
        >
        <body className="bg-surface text-foreground min-h-dvh flex flex-col font-sans antialiased selection:bg-brand-subtle selection:text-brand">
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <SessionProvider>
                {children}
            </SessionProvider>

            <Toaster
                position="top-right"
                toastOptions={{
                    classNames: {
                        toast:
                            "bg-surface-elevated text-foreground border-border shadow-dropdown rounded-xl",
                        title: "text-foreground font-medium text-sm",
                        description: "text-muted-foreground text-xs",
                        actionButton:
                            "bg-brand text-brand-foreground hover:bg-brand-hover transition-colors rounded-lg px-3 py-1.5 text-xs font-medium",
                        cancelButton:
                            "bg-surface-muted text-foreground hover:bg-surface-active transition-colors rounded-lg px-3 py-1.5 text-xs font-medium",
                        closeButton:
                            "bg-surface-elevated text-muted-foreground border-border hover:text-foreground hover:bg-surface-muted transition-colors",
                        error:
                            "!bg-danger-subtle !text-danger !border-danger-border",
                        success:
                            "!bg-success-subtle !text-success !border-success/30",
                        warning:
                            "!bg-warning-subtle !text-warning !border-warning/30",
                        info:
                            "!bg-info-subtle !text-info !border-info/30",
                    },
                }}
            />
        </ThemeProvider>
        </body>
        </html>
    );
}