import React, { JSX } from "react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ProfileDropdown } from "@/components/layout/ProfileDropdown";
import { auth } from "@/lib/auth";
import { LogoTextLink } from "@/components/dashboard/LogoTextLink";

export async function RootHeader(): Promise<JSX.Element> {
    const session = await auth();

    return <header
        className="shrink-0 z-20 backdrop-blur-md border-b border-border-subtle h-16"
    >
        <div className="w-full max-w-7xl h-full flex justify-between items-center px-4 mx-auto">
            <LogoTextLink />

            <div className="flex gap-3 items-center">
                <ThemeToggle/>
                {session?.user && <ProfileDropdown session={session}/>}
            </div>
        </div>
    </header>
}