import { JSX } from "react";
import Link from "next/link";
import { RecentIncidentItem, IncidentKind } from "../../types";
import { ShieldAlert, ShieldX, Ticket, AlertOctagon, ChevronRight } from "lucide-react";
import Emphasis from "@/components/layout/Emphasis";
import { formatRelativeTime } from "../../time";

interface RecentIncidentsFeedProps {
    incidents: RecentIncidentItem[];
    guildId: string;
}

function getIncidentIcon(kind: IncidentKind): JSX.Element {
    switch (kind) {
        case "MODERATION":
            return <ShieldX className="w-4 h-4 text-warning shrink-0" />;
        case "AUTOMOD":
            return <AlertOctagon className="w-4 h-4 text-danger shrink-0" />;
        case "RAID":
            return <ShieldAlert className="w-4 h-4 text-danger shrink-0" />;
        case "TICKET":
            return <Ticket className="w-4 h-4 text-brand shrink-0" />;
    }
}

function getIncidentBadgeClass(kind: IncidentKind): string {
    switch (kind) {
        case "MODERATION":
            return "text-warning border-warning/20";
        case "AUTOMOD":
            return "text-danger border-danger/20";
        case "RAID":
            return "text-danger border-danger/20";
        case "TICKET":
            return "text-brand border-brand/20";
    }
}

export function RecentIncidentsFeed({ incidents, guildId }: RecentIncidentsFeedProps): JSX.Element {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
                <Emphasis>Recent Incidents & Activity</Emphasis>
                <Link
                    href={`/dashboard/${guildId}/logs`}
                    className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 group"
                >
                    View All Logs
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
            </div>

            {incidents.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-border bg-surface/30 text-center text-muted-foreground text-sm">
                    No recent moderation incidents or tickets recorded on this server.
                </div>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {incidents.map((incident) => (
                        <Link
                            key={incident.id}
                            href={incident.href}
                            className="group p-3 rounded-xl border border-border bg-surface/50 hover:bg-surface hover:border-brand/30 transition-all flex flex-col justify-between space-y-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    {getIncidentIcon(incident.kind)}
                                    <span className="font-semibold text-foreground truncate">
                                        {incident.title}
                                    </span>
                                </div>
                                <span
                                    className={`text-sm font-semibold shrink-0 ${getIncidentBadgeClass(
                                        incident.kind
                                    )}`}
                                >
                                    {incident.kind}
                                </span>
                            </div>

                            <p className="text-sm line-clamp-2">
                                {incident.details}
                            </p>

                            <div className="flex items-center justify-between text-sm text-muted-foreground pt-1 border-t border-border/40">
                                <span className="truncate">
                                    {incident.target !== null ? `Target: @${incident.target}` : incident.actor !== null ? `By: @${incident.actor}` : "System"}
                                </span>
                                <span className="font-mono text-[10px] shrink-0 ml-1">
                                    {formatRelativeTime(incident.createdAt)}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
