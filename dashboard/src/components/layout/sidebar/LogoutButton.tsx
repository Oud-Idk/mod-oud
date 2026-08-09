"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { JSX } from "react";

export function LogoutButton(): JSX.Element {
    return (
        <button
            onClick={() => signOut()}
            title="Sign out"
            className="p-1.5 rounded hover:bg-[#2b2d31] text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
        >
            <LogOut className="w-5 h-5"/>
        </button>
    )
}