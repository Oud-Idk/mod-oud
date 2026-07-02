import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function DashboardHeader({ children, className }: { children: ReactNode, className?: string }) {
    return <p className={twMerge("font-bold text-3xl mb-4", className)}>{children}</p>
}