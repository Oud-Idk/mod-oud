// components/Table.tsx
import { ReactNode } from "react";

interface TableProps {
    children: ReactNode;
    className?: string;
}

export function Table({ children, className = "" }: TableProps) {
    return (
        <div className={`overflow-x-auto w-full border rounded-lg ${className}`}>
            <table className="min-w-full divide-y divide-neutral-500 text-left text-sm">
                {children}
            </table>
        </div>
    );
}

interface TableHeaderProps {
    headers: string[];
}

export function TableHeader({ headers }: TableHeaderProps) {
    return (
        <thead className="uppercase tracking-wider">
        <tr>
            {headers.map((header, idx) => (
                <th key={idx} scope="col" className="px-6 py-3 font-medium">
                    {header}
                </th>
            ))}
        </tr>
        </thead>
    );
}

interface TableBodyProps {
    children: ReactNode;
}

export function TableBody({ children }: TableBodyProps) {
    return (
        <tbody className="divide-y divide-neutral-300 dark:divide-neutral-700">
        {children}
        </tbody>
    );
}

interface TableRowProps {
    children: ReactNode;
    className?: string;
}

export function TableRow({ children, className = "" }: TableRowProps) {
    return (
        <tr className={`hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${className}`}>
            {children}
        </tr>
    );
}

interface TableCellProps {
    children: ReactNode;
    className?: string;
}

export function TableCell({ children, className = "" }: TableCellProps) {
    return (
        <td className={`px-6 py-4 text-sm ${className}`}>
            {children}
        </td>
    );
}