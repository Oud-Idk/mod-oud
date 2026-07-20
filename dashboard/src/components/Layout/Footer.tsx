import React from "react";
import { twMerge } from "tailwind-merge";

interface EmphasisProps {
    children: React.ReactNode;
    className?: string;
}

export default function Footer({ children, className }: EmphasisProps) {
    return <footer className={twMerge("text-sm text-neutral-500", className)}>{children}</footer>
}