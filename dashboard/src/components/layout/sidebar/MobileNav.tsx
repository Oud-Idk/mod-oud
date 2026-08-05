"use client";

import React, { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle"; // Import your ThemeToggle here

export function MobileNav({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    return (
        <div className="md:hidden">
            {/* Mobile Top Header */}
            <header className="h-16 border-b flex items-center justify-between px-4 bg-white dark:bg-black w-full">
                <span className="font-bold text-lg text-neutral-900 dark:text-white">Mod Oud</span>

                <div className="flex items-center gap-2">
                    {/* ThemeToggle is now handy on mobile too! */}
                    <ThemeToggle/>

                    <button
                        onClick={() => setIsOpen(true)}
                        className="p-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-md"
                        aria-label="Open menu"
                    >
                        <Menu className="w-6 h-6"/>
                    </button>
                </div>
            </header>

            {/* Dark Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sliding Drawer */}
            <div
                className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white dark:bg-neutral-950 transform transition-transform duration-300 ease-in-out ${
                    isOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="absolute top-3 right-3 z-50">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-900"
                        aria-label="Close menu"
                    >
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                <div className="h-full w-full">
                    {children}
                </div>
            </div>
        </div>
    );
}