import React from "react";
import { twMerge } from "tailwind-merge";

interface InputLabelProps {
    className?: string;
    children?: React.ReactNode;
}

export function InputLabel({ className, children }: InputLabelProps) {
    return <label className={twMerge("mb-0", className)}>{children}</label>;
}