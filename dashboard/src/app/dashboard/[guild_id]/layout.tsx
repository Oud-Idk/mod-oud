import React from "react";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import 'katex/dist/katex.min.css';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-full flex flex-row overflow-hidden antialiased`">
            <Sidebar/>
            <div className="flex-1 overflow-y-auto p-6 ">
                {children}
            </div>
        </div>
    );
}