import { JSX } from "react";
import { getGuildChannels, getTextChannelMap } from "@/features/_shared/channels";
import { fetchInitialReportsAction, saveReportConfigAction } from "@/features/report/actions";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ReportBody } from "@/features/report/components/ReportBody";
import { getReportConfig } from "@/features/report/queries";

interface ReportFeatureProps {
    guildId: string;
}

export async function ReportFeature({ guildId }: ReportFeatureProps): Promise<JSX.Element> {
    const [reportConfig, channels, initialReports, textChannelMap] = await Promise.all([
        getReportConfig(guildId),
        getGuildChannels(guildId),
        fetchInitialReportsAction(guildId),
        getTextChannelMap(guildId),
    ]);

    const onSave = saveReportConfigAction.bind(null, guildId);

    return (
        <div className="h-full flex flex-col">
            <DashboardHeader>Reporting</DashboardHeader>
            <ReportBody
                reportConfig={reportConfig}
                channels={channels}
                initialReports={initialReports}
                guildId={guildId}
                onSave={onSave}
                textChannelMap={textChannelMap}
            />
        </div>
    );
}