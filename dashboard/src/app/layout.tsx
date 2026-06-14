import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
        </ThemeProvider>
        </body>
        </html>
    );
}