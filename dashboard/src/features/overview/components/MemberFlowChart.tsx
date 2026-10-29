"use client";

import { JSX } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { MemberFlowPoint } from "../types";
import { axisTick, chartColors, chartStyle, formatDay, tooltipContentStyle } from "./chartTheme";

export function MemberFlowChart({ data }: { data: MemberFlowPoint[] }): JSX.Element {
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
            <Bar dataKey="joins" name="Joins" fill={chartColors.success} radius={[3, 3, 0, 0]} />
            <Bar dataKey="leaves" name="Leaves" fill={chartColors.danger} radius={[3, 3, 0, 0]} />
        </BarChart>
    );
}
