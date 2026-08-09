import React, { JSX } from "react";
import { twMerge } from "tailwind-merge";

interface EmphasisProps {
    children: React.ReactNode;
    className?: string;
}

export default function Footer({ children, className }: EmphasisProps): JSX.Element {
    return <footer className={twMerge("text-sm text-muted-foreground", className)}>{children}</footer>
}