import { auth } from "@/lib/auth";
import { ProfileDropdown } from "@/components/layout/ProfileDropdown";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import Link from "next/link";
import React, { JSX } from "react";
import Logo from "@/components/ui/Logo";

export default async function RootGroupLayout({
    children,
}: {
    children: React.ReactNode;
}): Promise<JSX.Element> {
    const session = await auth();

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-background">
            <header
                className="shrink-0 z-20 backdrop-blur-md bg-surface/80 border-b border-border-subtle">
                <div
                    className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-3 focus-ring">
                        <Logo/>
                        <span className="text-xl font-bold tracking-tight text-foreground">
                            Mod Oud
                        </span>
                    </Link>

                    <div className="flex gap-3 items-center">
                        {session?.user && <ProfileDropdown session={session}/>}
                        <ThemeToggle/>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto min-h-0 flex flex-col">
                {children}
            </main>
        </div>
    );
}