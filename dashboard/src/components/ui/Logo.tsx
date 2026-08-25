import React, { JSX } from "react";
import { cn } from "@/lib/cn";
import Image from "next/image";

interface LogoProps {
    className?: string;
}

export default function Logo({ className }: LogoProps): JSX.Element {
    return <>
        <Image src="/logo-black.svg" alt="Logo" width={64} height={64}
               className={cn("block dark:hidden w-10 h-10", className)}/>
        <Image src="/logo-white.svg" alt="Logo" width={64} height={64}
               className={cn("hidden dark:block w-10 h-10", className)}/>
    </>
}