import { JSX } from "react";
import Link from "next/link";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { ActiveRaid } from "../../types";
import { formatRelativeTime } from "../../time";

interface ActiveRaidBannerProps {
    raid: ActiveRaid | null;
    guildId: string;
}

export function ActiveRaidBanner({ raid, guildId }: ActiveRaidBannerProps): JSX.Element | null {
    if (raid === null) {
        return null;
    }

    return (
        <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-danger-border bg-danger-subtle"
        >
            <div className="flex items-center gap-3 min-w-0">
                <ShieldAlert className="w-5 h-5 text-danger shrink-0" />
                <div className="min-w-0">
                    <p className="font-semibold text-danger">Raid in progress</p>
                    <p className="text-sm text-muted-foreground">
                        Anti-Raid mitigations started {formatRelativeTime(raid.startedAt)}.
                    </p>
                </div>
            </div>
            <Link
                href={`/dashboard/${guildId}/anti-raid`}
                className="text-sm font-medium text-danger hover:text-danger-hover flex items-center gap-1 group shrink-0 focus-ring rounded-md"
            >
                Open Anti-Raid
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
        </div>
    );
}
