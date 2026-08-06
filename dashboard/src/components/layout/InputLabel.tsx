import React from "react";
import { twMerge } from "tailwind-merge";
import { cn } from "@/lib/cn";

interface InputLabelProps {
    className?: string;
    children?: React.ReactNode;
    required?: boolean;
}

export function InputLabel({ className, children, required = false }: InputLabelProps) {
    return <label className={cn("mb-1 mt-2 block font-medium", className)}>{children} {required && <span className="text-danger">*</span>}</label>;
}