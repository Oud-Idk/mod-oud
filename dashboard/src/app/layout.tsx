import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
    themeColor: "#0C1936",
    colorScheme: "dark light",
};

const siteConfig = {
    name: "Mod Oud",
    tagline: "Blazingly Fast Discord Moderation.",
    description:
        "Automate moderation, play music, have fun, and keep your Discord community safe quickly.",
    url: "https://discord.solartuff.co.id",
    ogImage: "/og.png",
};

export const metadata: Metadata = {
    metadataBase: new URL(siteConfig.url),
    title: {
        template: "%s | Mod Oud",
        default: "Mod Oud, Blazingly Fast Discord Moderation",
    },
    description: siteConfig.description,
    applicationName: siteConfig.name,
    authors: [{ name: "Oud" }],
    generator: "Next.js",
    keywords: [
        "Discord bot",
        "Discord moderation",
        "Rust Discord bot",
        "AutoMod",
        "High performance bot",
        "Mod Oud",
    ],
    creator: "Oud",
    publisher: "Mod Oud",

    // OpenGraph (Discord, Telegram, Facebook, LinkedIn)
    openGraph: {
        type: "website",
        locale: "en_US",
        url: siteConfig.url,
        title: "Mod Oud, Blazingly Fast Discord Moderation",
        description: siteConfig.description,
        siteName: siteConfig.name,
        images: [
            {
                url: siteConfig.ogImage,
                width: 1200,
                height: 630,
                alt: "Mod Oud, Blazingly Fast Discord Moderation",
            },
        ],
    },

    // Twitter / X Card
    twitter: {
        card: "summary_large_image",
        title: "Mod Oud, Blazingly Fast Discord Moderation",
        description: siteConfig.description,
        images: [siteConfig.ogImage],
        creator: "@modoud", // Optional: your handle
    },

    // Robots & Indexing
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },

    icons: {
        icon: "/favicon.ico",
        shortcut: "/favicon-16x16.png",
        apple: "/apple-touch-icon.png",
    },
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
        <body
            className="bg-surface text-foreground min-h-dvh flex flex-col font-sans antialiased selection:bg-brand-subtle selection:text-brand">
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