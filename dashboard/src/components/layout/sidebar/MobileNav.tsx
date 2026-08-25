"use client";

import React, { JSX, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import Logo from "@/components/ui/Logo";

export function MobileNav({ children }: { children: React.ReactNode }): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    // Auto-close on navigation
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    return (
        <div className="md:hidden">
            {/* 1. The Mobile Top Header bar (Always visible on mobile) */}
            <header
                className="h-14 border-b border-border-subtle flex items-center justify-between px-4 bg-surface text-foreground w-full sticky top-0 z-30">
                <div className="flex items-center gap-2">
                    <Logo className="w-8 h-8"/>
                    <span className="font-bold text-sm tracking-tight">Mod Oud</span>
                </div>

                <div className="flex items-center gap-2">
                    <ThemeToggle/>
                    <button
                        type="button"
                        onClick={() => {
                            setIsOpen(true);
                        }}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-surface-active rounded-lg transition-colors focus-ring"
                        aria-label="Open sidebar"
                    >
                        <Menu className="w-5 h-5"/>
                    </button>
                </div>
            </header>

            {/* 2. Backdrop Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-overlay backdrop-blur-xs transition-opacity duration-200"
                    onClick={() => {
                        setIsOpen(false);
                    }}
                    aria-hidden="true"
                />
            )}

            <div
                className={`fixed top-0 bottom-0 left-0 z-50  bg-surface border-r border-border shadow-dropdown transform transition-transform duration-300 ease-in-out ${
                    isOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <button
                    type="button"
                    onClick={() => {
                        setIsOpen(false);
                    }}
                    className="absolute top-3 right-3 z-50 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-active transition-colors focus-ring"
                    aria-label="Close sidebar"
                >
                    <X className="w-4 h-4"/>
                </button>
                {children}
            </div>
        </div>
    );
}