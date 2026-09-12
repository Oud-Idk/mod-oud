import React, { JSX } from "react";
import Link from "next/link";
import Logo from "@/components/ui/icons/Logo";

export function LogoTextLink(): JSX.Element {
    return <Link href="/" className="flex items-center gap-3 focus-ring">
        <Logo/>
        <span className="text-lg font-bold tracking-tight text-foreground">
            Mod Oud
        </span>
    </Link>
}