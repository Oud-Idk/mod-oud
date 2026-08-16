import { auth } from "@/lib/auth";
import { ProfileDropdown } from "@/components/layout/ProfileDropdown";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import React, { JSX } from "react";

export default async function RootGroupLayout({
    children,
}: {
    children: React.ReactNode;
}): Promise<JSX.Element> {
    const session = await auth();

    return (
        <div className="min-h-screen flex flex-col">
            {/* The Global Header for everything except Dashboard */}
            <header className="sticky top-0 z-10 backdrop-blur-md bg-surface/80 border-b border-border-subtle">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-brand-subtle text-brand border border-brand/20">
                            <ShieldCheck className="w-5 h-5" strokeWidth={2.5} />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-foreground">
                            Mod Oud
                        </span>
                    </Link>

                    <div className="flex gap-3 items-center">
                        {session?.user && <ProfileDropdown session={session} />}
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            {/* Page Content */}
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}