"use client";

import { JSX } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AutomodBreakdownItem } from "../types";
import { axisTick, chartColors, chartStyle, tooltipContentStyle } from "./chartTheme";

export function AutomodBreakdownChart({ data }: { data: AutomodBreakdownItem[] }): JSX.Element {
    return (
        <BarChart
            responsive
            layout="vertical"
            data={data}
            style={chartStyle}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        >
            <CartesianGrid horizontal={false} stroke={chartColors.grid} />
            <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="rule" width={120} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: chartColors.cursor }} contentStyle={tooltipContentStyle} />
            <Bar dataKey="count" name="Triggers" fill={chartColors.brand} radius={[0, 3, 3, 0]} />
        </BarChart>
    );
}
