import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { LogBody } from "@/features/logs/components/LogBody";
import { JSX} from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function LogPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return (
        <div className="space-y-6">
            <DashboardHeader>Logs</DashboardHeader>
            <LogBody guildId={guild_id}/>
        </div>
    );
}