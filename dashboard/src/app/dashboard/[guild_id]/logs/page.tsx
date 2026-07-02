import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { LogBody } from "@/components/Dashboards/Logs/LogBody";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function LogPage({ params }: PageProps) {
    const { guild_id } = await params;
    return (
        <div className="space-y-6">
            <DashboardHeader>Logs</DashboardHeader>
            <LogBody guildId={guild_id}/>
        </div>
    );
}