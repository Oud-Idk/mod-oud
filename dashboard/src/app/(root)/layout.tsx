import React, { JSX } from "react";
import { RootHeader } from "@/components/dashboard/RootHeader";

export default function RootGroupLayout({
    children,
}: {
    children: React.ReactNode;
}): JSX.Element {

    return (
        <div className="h-dvh flex flex-col overflow-hidden">
            <RootHeader />

            <main className="flex-1 overflow-y-auto min-h-0 flex flex-col">
                {children}
            </main>
        </div>
    );
}

