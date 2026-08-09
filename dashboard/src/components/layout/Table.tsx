import React, { JSX, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TableProps {
    children: ReactNode;
    className?: string;
}

export function Table({ children, className }: TableProps): JSX.Element {
    return (
        <div className={cn("overflow-x-auto w-full border border-border rounded-lg bg-surface shadow-sm", className)}>
            <table className="min-w-full divide-y divide-border text-left text-sm">
                {children}
            </table>
        </div>
    );
}

interface TableHeaderProps {
    headers: (string | ReactNode)[];
    className?: string;
}

export function TableHeader({ headers, className }: TableHeaderProps): JSX.Element {
    return (
        <thead className={cn("bg-surface-muted border-b border-border", className)}>
        <tr>
            {headers.map((header, idx) => (
                <th
                    key={idx}
                    scope="col"
                    className="px-6 py-3.5"
                >
                    {header}
                </th>
            ))}
        </tr>
        </thead>
    );
}

interface TableBodyProps {
    children: ReactNode;
    className?: string;
}

export function TableBody({ children, className }: TableBodyProps): JSX.Element {
    return (
        <tbody className={cn("divide-y divide-border-subtle bg-surface", className)}>
        {children}
        </tbody>
    );
}

interface TableRowProps {
    children: ReactNode;
    className?: string;
}

export function TableRow({ children, className }: TableRowProps): JSX.Element {
    return (
        <tr className={cn("hover:bg-surface-active/35 transition-colors duration-150", className)}>
            {children}
        </tr>
    );
}

interface TableCellProps {
    children: ReactNode;
    className?: string;
}

export function TableCell({ children, className }: TableCellProps): JSX.Element {
    return (
        <td className={cn("px-6 py-4 text-sm text-foreground", className)}>
            {children}
        </td>
    );
}