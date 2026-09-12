import React, { JSX } from "react";
import { cn } from "@/lib/cn";
import Image from "next/image";

interface GithubLogoProps {
    className?: string;
}

export default function GithubLogo({ className }: GithubLogoProps): JSX.Element {
    return <>
        <Image src="/invertocat-black.svg" alt="Logo" width={64} height={64} loading="eager"
            className={cn("block dark:hidden w-10 h-10", className)}/>
        <Image src="/invertocat-white.svg" alt="Logo" width={64} height={64} loading="eager"
            className={cn("hidden dark:block w-10 h-10", className)}/>
    </>
}