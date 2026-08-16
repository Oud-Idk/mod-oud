import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { LogBody } from "./LogBody";
import { JSX} from "react";

interface LogsFeatureProps {
    guildId: string;
}

export function LogsFeature({ guildId }: LogsFeatureProps): JSX.Element {
    return (
        <div className="space-y-6">
            <DashboardHeader>Logs</DashboardHeader>
            <LogBody guildId={guildId} />
        </div>
    );
}