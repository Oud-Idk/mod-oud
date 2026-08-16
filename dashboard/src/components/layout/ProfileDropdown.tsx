"use client";

import { Fragment, JSX } from "react";
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from "@headlessui/react";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import Image from "next/image";
import { LogOut } from "lucide-react";

interface ProfileDropdownProps {
    session: Session | null;
}

export function ProfileDropdown({ session }: ProfileDropdownProps): JSX.Element | null {
    if (session === null) return null;

    const name = session.user.name;
    const image = session.user.image;

    // Explicit checks for strict-boolean-expressions
    const hasName = typeof name === "string" && name.length > 0;
    const hasImage = typeof image === "string" && image.length > 0;
    const userInitial = hasName ? name.charAt(0).toUpperCase() : "?";

    return (
        <Menu as="div" className="relative">
            <div>
                <MenuButton className="relative flex items-center gap-2 rounded-full text-sm focus-ring cursor-pointer group">
                    <span className="sr-only">Open user menu</span>
                    {hasImage ? (
                        <div className="relative w-8 h-8 rounded-full overflow-hidden ring-1 ring-border-subtle group-hover:ring-brand/50 transition-all">
                            <Image
                                className="object-cover"
                                src={image}
                                alt="User avatar"
                                fill
                                sizes="32px"
                            />
                        </div>
                    ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-subtle text-brand border border-brand/20 font-bold text-xs">
                            {userInitial}
                        </div>
                    )}
                </MenuButton>
            </div>

            <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <MenuItems className="absolute right-0 z-50 mt-2 w-52 origin-top-right rounded-xl bg-surface-elevated p-1.5 shadow-dropdown border border-border focus:outline-none">
                    {/* User Info Header */}
                    <div className="px-3 py-2 border-b border-border-subtle mb-1">
                        <p className="text-xs text-muted-foreground font-medium">Signed in as</p>
                        <p className="text-sm font-semibold text-foreground truncate mt-0.5">
                            {hasName ? name : "Discord User"}
                        </p>
                    </div>

                    {/* Action Menu Items */}
                    <MenuItem>
                        {({ focus }) => (
                            <button
                                type="button"
                                onClick={() => void signOut()}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-danger ${
                                    focus ? "bg-danger-subtle text-danger" : "hover:bg-danger-subtle"
                                }`}
                            >
                                <LogOut className="w-4 h-4 shrink-0" />
                                <span>Sign out</span>
                            </button>
                        )}
                    </MenuItem>
                </MenuItems>
            </Transition>
        </Menu>
    );
}