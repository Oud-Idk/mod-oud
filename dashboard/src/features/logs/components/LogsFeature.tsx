import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { LogBody } from "./LogBody";
import { JSX} from "react";

interface LogsFeatureProps {
    guildId: string;
}

export async function LogsFeature({ guildId }: LogsFeatureProps): Promise<JSX.Element> {
    return (
        <div className="space-y-6">
            <DashboardHeader>Logs</DashboardHeader>
            <LogBody guildId={guildId} />
        </div>
    );
}