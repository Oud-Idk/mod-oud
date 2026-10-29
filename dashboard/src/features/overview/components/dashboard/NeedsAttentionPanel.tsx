import { JSX } from "react";
import Link from "next/link";
import { BellOff, ChevronRight, Hourglass, PartyPopper, Ticket } from "lucide-react";
import Emphasis from "@/components/layout/Emphasis";
import { AttentionItem, AttentionKind } from "../../types";

interface NeedsAttentionPanelProps {
    items: AttentionItem[];
}

function getAttentionIcon(kind: AttentionKind): JSX.Element {
    switch (kind) {
        case "OPEN_TICKETS":
            return <Ticket className="w-4 h-4 text-brand shrink-0" />;
        case "GIVEAWAYS_ENDING":
            return <PartyPopper className="w-4 h-4 text-info shrink-0" />;
        case "TEMP_BANS_EXPIRING":
            return <Hourglass className="w-4 h-4 text-warning shrink-0" />;
        case "FAILING_REMINDERS":
            return <BellOff className="w-4 h-4 text-danger shrink-0" />;
    }
}

export function NeedsAttentionPanel({ items }: NeedsAttentionPanelProps): JSX.Element {
    return (
        <div className="space-y-3">
            <div className="border-b border-border pb-2">
                <Emphasis>Needs Attention</Emphasis>
            </div>

            {items.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-border bg-surface/30 text-center text-muted-foreground text-sm">
                    Nothing needs attention right now.
                </div>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((item) => (
                        <Link
                            key={item.kind}
                            href={item.href}
                            className="group p-3 rounded-xl border border-border bg-surface/50 hover:bg-surface hover:border-brand/30 transition-all flex items-center justify-between gap-2"
                        >
                            <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    {getAttentionIcon(item.kind)}
                                    <span className="font-semibold text-foreground truncate">{item.title}</span>
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">{item.detail}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
