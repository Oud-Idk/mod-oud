import React, { JSX } from "react";
import Emphasis from "@/components/layout/Emphasis";
import { cn } from "@/lib/cn";
import { getAutomodBreakdown, getMemberFlow, getModerationActivity } from "../../../queries/charts";
import { MODERATION_SERIES } from "../../../types";
import { MemberFlowChart } from "./MemberFlowChart";
import { ModerationActivityChart } from "./ModerationActivityChart";
import { AutomodBreakdownChart } from "./AutomodBreakdownChart";

const WINDOW_DAYS = 30;

interface ChartPanelProps {
    title: string;
    total: number;
    emptyText: string;
    className?: string;
    children: React.ReactNode;
}

function ChartPanel({ title, total, emptyText, className, children }: ChartPanelProps): JSX.Element {
    return (
        <div className={cn("p-4 rounded-lg border border-border bg-surface space-y-3", className)}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{title}</p>
                <span className="text-xs text-muted-foreground">{total.toLocaleString()} total</span>
            </div>
            {total === 0 ? (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                    {emptyText}
                </div>
            ) : (
                children
            )}
        </div>
    );
}

export async function ActivityCharts({ guildId }: { guildId: string }): Promise<JSX.Element> {
    const [memberFlow, moderation, automod] = await Promise.all([
        getMemberFlow(guildId, WINDOW_DAYS),
        getModerationActivity(guildId, WINDOW_DAYS),
        getAutomodBreakdown(guildId, WINDOW_DAYS),
    ]);

    const memberTotal = memberFlow.reduce((sum, p) => sum + p.joins + p.leaves, 0);
    const moderationTotal = moderation.reduce(
        (sum, p) => sum + MODERATION_SERIES.reduce((s, series) => s + p[series], 0),
        0
    );
    const automodTotal = automod.reduce((sum, item) => sum + item.count, 0);

    return (
        <div className="space-y-2">
            <Emphasis>Activity (last {WINDOW_DAYS} days, UTC)</Emphasis>
            <div className="grid gap-4 lg:grid-cols-2">
                <ChartPanel title="Member Flow" total={memberTotal} emptyText="No joins or leaves recorded.">
                    <MemberFlowChart data={memberFlow} />
                </ChartPanel>
                <ChartPanel title="Moderation Actions" total={moderationTotal} emptyText="No moderation actions recorded.">
                    <ModerationActivityChart data={moderation} />
                </ChartPanel>
                <ChartPanel
                    title="AutoMod Triggers by Rule"
                    total={automodTotal}
                    emptyText="No AutoMod triggers recorded."
                    className="lg:col-span-2"
                >
                    <AutomodBreakdownChart data={automod} />
                </ChartPanel>
            </div>
        </div>
    );
}
