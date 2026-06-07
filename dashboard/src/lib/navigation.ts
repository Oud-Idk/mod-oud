import { ComponentType, SVGProps } from "react";
import { FolderIcon, UserIcon } from "@heroicons/react/24/outline";
import { GroupIcon, RockingChairIcon, SchoolIcon } from "lucide-react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavLink {
    type: 'link';
    name: string;
    href: string;
    admin?: boolean;
}

export interface ProductLink {
    name: string;
    description: string;
    href: string;
    icon: Icon;
}

export interface CallToActionLink {
    name: string;
    href: string;
    icon: Icon;
}

export interface NavDropdown {
    type: 'dropdown';
    name: string;
    products: ProductLink[];
    callsToAction?: CallToActionLink[];
    admin?: boolean; // Make it optional
}

export type NavItem = NavLink | NavDropdown;

export interface NavConfig {
    navItems: NavItem[];
    brandName: string;
    logoUrl?: string;
}

export const navigationConfigItems: NavItem[] = [
    { type: 'link', name: 'Home', href: '/' },
    { type: 'link', name: 'Homework Tracker', href: '/homework-tracker' },
    { type: 'link', name: 'Feeds', href: '/feeds' },
    { type: 'link', name: 'Journal', href: '/journal' },
    {
        type: 'dropdown', name: 'Admins', admin: true, products: [
            {
                name: "Groups",
                description: "Manage Groups",
                href: "/admin/groups",
                icon: FolderIcon,
            },
            {
                name: "Users",
                description: "Manage User's Roles",
                href: "/admin/users",
                icon: UserIcon,
            },
            {
                name: 'Classroom',
                description: 'Manage Classrooms',
                href: '/admin/classrooms',
                icon: SchoolIcon,
            },
            {
                name: 'Seating Arrangement',
                description: 'Make Seating Arrangement',
                href: '/admin/seater',
                icon: RockingChairIcon,
            }
        ],
    },
    {
        type: 'dropdown', name: 'Utilities', products: [
            {
                name: 'Grouper',
                description: 'Make Groups',
                href: '/utilities/grouper',
                icon: GroupIcon,
            },
        ],
    },
];

export const navigationConfig: NavConfig = {
    navItems: navigationConfigItems,
    brandName: "Homework Site",
}