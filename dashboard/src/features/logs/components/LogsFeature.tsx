import { DashboardHeader } from "@/components/dashboard/DashboardHeader"; // Generic UI
import { LogBody } from "./LogBody";
import { ReactNode } from "react";

interface LogsFeatureProps {
    guildId: string;
}

export async function LogsFeature({ guildId }: LogsFeatureProps): Promise<ReactNode> {
    return (
        <div className="space-y-6">
            <DashboardHeader>Logs</DashboardHeader>
            <LogBody guildId={guildId} />
        </div>
    );
}