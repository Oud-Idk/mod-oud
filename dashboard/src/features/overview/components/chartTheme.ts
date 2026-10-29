import { CSSProperties } from "react";

// Recharts takes colours as SVG attributes, so tokens are passed as CSS variables to keep
// dark mode a variable swap.
export const chartColors = {
    brand: "var(--brand)",
    success: "var(--success)",
    danger: "var(--danger)",
    warning: "var(--warning)",
    info: "var(--info)",
    muted: "var(--muted-foreground)",
    grid: "var(--border-subtle)",
    cursor: "var(--surface-muted)",
} as const;

export const axisTick = { fill: chartColors.muted, fontSize: 11 };

export const tooltipContentStyle: CSSProperties = {
    backgroundColor: "var(--surface-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "0.5rem",
    color: "var(--foreground)",
    fontSize: "0.75rem",
};

export const chartStyle: CSSProperties = { width: "100%", height: 224 };

// Fixed locale and zone so the server and client render the same label.
const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function formatDay(day: unknown): string {
    if (typeof day !== "string") return "";
    const date = new Date(`${day}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? day : dayFormatter.format(date);
}
