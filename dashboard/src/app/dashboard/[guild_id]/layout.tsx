import React from "react";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MobileNav } from "@/components/Sidebar/MobileNav";
import 'katex/dist/katex.min.css';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-screen flex flex-col md:flex-row overflow-hidden antialiased">
            <MobileNav>
                <Sidebar/>
            </MobileNav>

            <aside className="hidden md:flex md:shrink-0">
                <Sidebar/>
            </aside>

            <main className="flex-1 overflow-y-auto p-4">
                {children}
            </main>
        </div>
    );
}