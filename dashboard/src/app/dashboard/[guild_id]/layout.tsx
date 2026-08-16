// app/dashboard/[guild_id]/layout.tsx
import React, { JSX } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/Sidebar";
import { MobileNav } from "@/components/layout/sidebar/MobileNav";
import 'katex/dist/katex.min.css';
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}): Promise<JSX.Element> {
    const session = await auth();

    if (!session) {
        redirect("/");
    }

    return (
        <div className="theme-dashboard bg-surface text-foreground h-screen flex flex-col md:flex-row overflow-hidden antialiased">
            <MobileNav>
                <Sidebar />
            </MobileNav>

            <aside className="hidden md:flex md:shrink-0 border-r border-border-subtle bg-surface">
                <Sidebar />
            </aside>

            <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-surface">
                {children}
            </main>
        </div>
    );
}