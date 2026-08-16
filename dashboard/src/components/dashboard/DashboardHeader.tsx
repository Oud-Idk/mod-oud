import { JSX, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function DashboardHeader({ children, className }: { children: ReactNode, className?: string }): JSX.Element {
    return <h1 className={twMerge("font-bold text-3xl mb-2", className)}>{children}</h1>
}