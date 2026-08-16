import React, { JSX } from "react";
import Emphasis from "@/components/layout/Emphasis";
import { BananaIcon } from "lucide-react";
import Footer from "@/components/layout/Footer";
import Link from "next/link";
import { ProfileDropdown } from "@/components/layout/ProfileDropdown";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { auth } from "@/lib/auth";

export default async function NotFound(): Promise<JSX.Element> {
    const session = await auth();

    return <main>
        <header className="sticky top-0 z-10 backdrop-blur-md bg-surface/80 border-b border-border-subtle">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                <Link href="/" className="flex items-center gap-3 focus-ring">
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
        <div className="rounded-xl min-w-60 min-h-100 max-w-150 w-2/3 bg-surface absolute top-1/2 left-1/2 -translate-1/2 border border-border p-6 flex flex-col items-center justify-center gap-2 text-center">
            <Emphasis className="text-2xl sm:text-4xl font-bold">Mod Oud</Emphasis>
            <Emphasis className="text-lg sm:text-2xl">Oops! Hello there, lost traveler.</Emphasis>
            <p className="text-sm sm:text-base">Seems like you ended up in a page that doesn&apos;t exist! Here, have this banana</p>
            <div>
                <BananaIcon className="w-24 h-24 text-yellow-500"/>
                <Footer>Nom nom nom!</Footer>
            </div>
            <div className="flex flex-col gap-2 text-center">
                <Link href="/" className="p-2 px-4 border border-brand rounded-xl text-brand">Go Back to Home Page</Link>
                <Link
                    href="/very-secret-endpoint-do-not-index-also-timestamp-today-1786548272"
                    className="p-2 px-4 border border-pink-500 rounded-xl text-pink-500">
                    Or if you&apos;re lonely, Go Here!
                </Link>
            </div>
        </div>
    </main>
}