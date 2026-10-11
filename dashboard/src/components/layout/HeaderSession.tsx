"use client";

import { JSX } from "react";
import { useSession } from "next-auth/react";
import { ProfileDropdown } from "@/components/layout/ProfileDropdown";

// Client-side counterpart to the old server-side auth() read, so the header
// stays out of the static render path. Same size as the avatar while loading.
export function HeaderSession(): JSX.Element | null {
    const { data: session, status } = useSession();

    if (status === "loading") {
        return <div className="w-8 h-8 rounded-full bg-surface-muted animate-pulse" aria-hidden="true" />;
    }

    if (session === null) {
        return null;
    }

    return <ProfileDropdown session={session} />;
}
