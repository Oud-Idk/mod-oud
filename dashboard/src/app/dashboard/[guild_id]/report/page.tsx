import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { getGuildChannels } from "@/utils/discord";
import { getReportConfig } from "@/utils/db/config";
import { saveReportConfigAction } from "@/actions/config";
import { ReportBody } from "@/components/Dashboards/Report/ReportBody";
import { fetchInitialReports } from "@/actions/reports";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function ReportPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [reportConfig, channels, initialReports] = await Promise.all([
        getReportConfig(guild_id),
        getGuildChannels(guild_id),
        fetchInitialReports(guild_id),
    ]);

    const onSave = saveReportConfigAction.bind(null, guild_id);

    return (
        <div className="h-full flex flex-col">
            <DashboardHeader>Reporting</DashboardHeader>
            <ReportBody
                reportConfig={reportConfig}
                channels={channels}
                initialReports={initialReports}
                guildId={guild_id}
                onSave={onSave}
            />
        </div>
    );
}