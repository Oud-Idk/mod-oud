export function EmptyLogsState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-border-subtle rounded-lg bg-surface-muted/30">
            <p className="text-sm font-semibold text-foreground">No Logs Found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">{message}</p>
        </div>
    );
}
