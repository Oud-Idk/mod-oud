import React, { JSX } from "react";
import { twMerge } from "tailwind-merge";

interface EmphasisProps {
    children: React.ReactNode;
    className?: string;
}

export default function Emphasis({ children, className }: EmphasisProps): JSX.Element {
    return <h4 className={twMerge("text-lg font-medium", className)}>{children}</h4>
}