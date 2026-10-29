/** Coarse span such as `5m`, `3h` or `2d`. Spans under a minute round up to `1m`. */
export function formatDuration(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60)).toString()}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600).toString()}h`;
    return `${Math.floor(seconds / 86400).toString()}d`;
}

export function formatRelativeTime(date: Date, now: number = Date.now()): string {
    const ms = now - date.getTime();
    if (ms < 60_000) return "just now";
    return `${formatDuration(ms)} ago`;
}
