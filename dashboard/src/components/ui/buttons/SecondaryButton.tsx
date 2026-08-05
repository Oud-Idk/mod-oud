import React from "react";
import { twMerge } from "tailwind-merge";
import BaseButton from "@/components/ui/buttons/BaseButton";

interface ButtonProps {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    className?: string;
    children?: React.ReactNode;
    disabled?: boolean;
}

export default function SecondaryButton({ onClick, className, children, disabled }: ButtonProps) {
    return <BaseButton
        onClick={onClick} className={twMerge("border-neutral-500 " + className)} disabled={disabled}
    >
        {children}
    </BaseButton>
}