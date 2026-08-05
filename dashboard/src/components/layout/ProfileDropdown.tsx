'use client'

import { Fragment } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { signOut } from 'next-auth/react'
import type { Session } from 'next-auth'
import Image from 'next/image'
import {
    ArrowLeftEndOnRectangleIcon,
    Cog6ToothIcon,
    DocumentTextIcon, PhotoIcon // 1. Imported the new icon
} from '@heroicons/react/24/outline'
import Link from "next/link";

function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ')
}

type ProfileDropdownProps = {
    session: Session | null;
};

export function ProfileDropdown({ session }: ProfileDropdownProps) {
    if (!session) return null;
    if (!session.user) return null;

    const { name, image } = session.user;
    const userInitial = name ? name.charAt(0).toUpperCase() : '?';

    return (
        <Menu as="div" className="relative ml-3">
            <div>
                <MenuButton className="relative flex rounded-full text-sm focus:outline-none cursor-pointer">
                    <span className="absolute -inset-1.5"/>
                    <span className="sr-only">Open user menu</span>
                    {image ? (
                        <Image
                            className="h-8 w-8 rounded-full"
                            src={image}
                            alt="User profile picture"
                            width={32}
                            height={32}
                        />
                    ) : (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-500">
                            <span className="text-sm font-medium leading-none text-white">{userInitial}</span>
                        </span>
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
                <MenuItems
                    className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white dark:bg-black py-1 shadow-lg focus:outline-none border dark:border-neutral-800">
                    <div className="px-4 py-3">
                        <p className="text-sm text-neutral-900 dark:text-white">
                            {name}
                        </p>
                    </div>
                    <MenuItem>
                        {({ focus }) => (
                            <button
                                onClick={() => signOut()}
                                className={classNames(
                                    focus ? 'bg-neutral-100 dark:bg-neutral-800' : '',
                                    'w-full text-left flex items-center gap-x-2 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer'
                                )}
                            >
                                <ArrowLeftEndOnRectangleIcon className="h-4 w-4"/>
                                Sign out
                            </button>
                        )}
                    </MenuItem>
                </MenuItems>
            </Transition>
        </Menu>
    )
}