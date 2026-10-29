import { JSX } from "react";
import { AlertOctagon, ShieldX, Ticket, Users } from "lucide-react";
import Emphasis from "@/components/layout/Emphasis";
import { Card } from "./telemetry/Card";
import { StatCardId, StatCardItem } from "../../types";

interface WeeklyStatCardsProps {
    stats: StatCardItem[] | null;
}

function getStatIcon(id: StatCardId): JSX.Element {
    switch (id) {
        case "member_growth":
            return <Users className="text-brand" />;
        case "moderation":
            return <ShieldX className="text-warning" />;
        case "automod":
            return <AlertOctagon className="text-danger" />;
        case "tickets":
            return <Ticket className="text-info" />;
    }
}

export function WeeklyStatCards({ stats }: WeeklyStatCardsProps): JSX.Element | null {
    if (stats === null) {
        return null;
    }

    return (
        <div className="space-y-2">
            <Emphasis>Last 7 Days</Emphasis>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card
                        key={stat.id}
                        icon={getStatIcon(stat.id)}
                        title={stat.title}
                        main={stat.value}
                        footer={stat.delta}
                    />
                ))}
            </div>
        </div>
    );
}
