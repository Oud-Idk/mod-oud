import { ReactNode } from "react";

export function DashboardHeader({ children }: { children: ReactNode }) {
    return <p className="font-bold text-3xl mb-4">{children}</p>
}