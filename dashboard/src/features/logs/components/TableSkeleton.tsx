import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";

export function TableSkeleton({ headers, rows = 5 }: { headers: string[]; rows?: number }) {
    return (
        <Table>
            <TableHeader headers={headers} />
            <TableBody>
                {Array.from({ length: rows }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                        {headers.map((_, j) => (
                            <TableCell key={j}>
                                <div className="h-4 bg-surface-muted border border-border-subtle rounded w-2/3" />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}