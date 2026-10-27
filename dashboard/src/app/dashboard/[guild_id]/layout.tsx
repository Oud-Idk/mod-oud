// app/dashboard/[guild_id]/layout.tsx
import React, { JSX } from "react";
import { notFound, redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/Sidebar";
import { MobileNav } from "@/components/layout/sidebar/MobileNav";
import 'katex/dist/katex.min.css';
import { auth } from "@/lib/auth";
import { currentUserManagesGuild } from "@/features/_shared/guild";

interface LayoutProps {
    children: React.ReactNode;
    params: Promise<{ guild_id: string }>;
}

export default async function DashboardLayout({
    children,
    params,
}: LayoutProps): Promise<JSX.Element> {
    const session = await auth();

    if (!session) {
        redirect("/");
    }

    // Every page beneath this layout reads its guild's configuration, so the check belongs
    // here rather than in each page. Answering not-found rather than forbidden keeps the
    // existence of another guild's settings unconfirmed.
    const { guild_id } = await params;
    if (!(await currentUserManagesGuild(guild_id))) {
        notFound();
    }

    return (
        <div
            className="h-dvh flex flex-col md:flex-row overflow-hidden antialiased">
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus-ring rounded-lg"
            >
                Skip to main content
            </a>

            <MobileNav>
                <Sidebar/>
            </MobileNav>

            <aside className="hidden md:flex md:shrink-0 border-r border-border-subtle">
                <Sidebar/>
            </aside>

            <main className="flex-1 h-full overflow-y-auto p-4 md:p-6" id="main-content">
                {children}
            </main>
        </div>
    );
}