"use client";

import { JSX } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { MODERATION_SERIES, ModerationActivityPoint, ModerationSeries } from "../types";
import { axisTick, chartColors, chartStyle, formatDay, tooltipContentStyle } from "./chartTheme";

const SERIES_STYLE: Record<ModerationSeries, { name: string; color: string }> = {
    bans: { name: "Bans", color: chartColors.danger },
    kicks: { name: "Kicks", color: chartColors.warning },
    mutes: { name: "Mutes", color: chartColors.info },
    warns: { name: "Warns", color: chartColors.brand },
    other: { name: "Other", color: chartColors.muted },
};

export function ModerationActivityChart({ data }: { data: ModerationActivityPoint[] }): JSX.Element {
    return (
        <BarChart responsive data={data} style={chartStyle} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} />
            <XAxis dataKey="day" tickFormatter={formatDay} tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip
                cursor={{ fill: chartColors.cursor }}
                contentStyle={tooltipContentStyle}
                labelFormatter={formatDay}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            {MODERATION_SERIES.map((series) => (
                <Bar
                    key={series}
                    dataKey={series}
                    name={SERIES_STYLE[series].name}
                    stackId="actions"
                    fill={SERIES_STYLE[series].color}
                />
            ))}
        </BarChart>
    );
}
