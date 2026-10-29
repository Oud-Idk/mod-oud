import { JSX } from "react";
import Emphasis from "@/components/layout/Emphasis";

function Block({ className }: { className: string }): JSX.Element {
    return <div className={`rounded-lg border border-border-subtle bg-surface-muted ${className}`} />;
}

export function StatusPillSkeleton(): JSX.Element {
    return <div className="h-6 w-24 rounded-full bg-surface-muted animate-pulse" aria-hidden="true" />;
}

export function TelemetryCardsSkeleton(): JSX.Element {
    return (
        <div className="space-y-2" aria-busy="true">
            <Emphasis>System Telemetry</Emphasis>
            <div className="grid gap-4 md:grid-cols-4 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Block key={i} className="h-20" />
                ))}
            </div>
        </div>
    );
}

export function ActivityChartsSkeleton(): JSX.Element {
    return (
        <div className="space-y-2" aria-busy="true">
            <Emphasis>Activity</Emphasis>
            <div className="grid gap-4 lg:grid-cols-2 animate-pulse">
                <Block className="h-72" />
                <Block className="h-72" />
                <Block className="h-72 lg:col-span-2" />
            </div>
        </div>
    );
}
