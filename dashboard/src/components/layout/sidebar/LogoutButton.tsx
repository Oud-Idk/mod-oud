"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { JSX } from "react";

export function LogoutButton(): JSX.Element {
    return (
        <button
            onClick={() => { void signOut(); }}
            title="Sign out"
            className="p-1.5 rounded hover:bg-surface-elevated transition-colors cursor-pointer focus-ring"
        >
            <LogOut className="w-5 h-5"/>
        </button>
    )
}