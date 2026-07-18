import React from "react";
import { twMerge } from "tailwind-merge";
import { Button as HeadlessButton } from "@headlessui/react";

interface ButtonProps {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    className?: string;
    children?: React.ReactNode;
    disabled?: boolean;
}

export default function BaseButton({ onClick, className, children, disabled }: ButtonProps) {
    return <HeadlessButton
        onClick={onClick} className={twMerge(
        "px-3.5 py-1.5 rounded transition border " +
        "hover:bg-neutral-400/10 cursor-pointer " +
        "disabled:border-neutral-500/50 disabled:text-neutral-500/50 disabled:cursor-not-allowed", className,
    )} disabled={disabled}
    >
        {children}
    </HeadlessButton>
}