import React from "react";
import { twMerge } from "tailwind-merge";
import BaseButton from "@/components/Inputs/Buttons/BaseButton";

interface ButtonProps {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    className?: string;
    children?: React.ReactNode;
    disabled?: boolean;
}

export default function PrimaryButton({ onClick, className, children, disabled }: ButtonProps) {
    return <BaseButton
        onClick={onClick} className={twMerge("border-blue-700 dark:border-blue-300 " + className)} disabled={disabled}
    >
        {children}
    </BaseButton>
}