import { BuilderConfig } from "@/features/_shared/builderConfig";
import { ReportTabValue } from "@/features/report/components/Tabs/NotificationsTab";

const REPORT_PLACEHOLDER_METADATA = [
    {
        key: "server.name",
        mockValue: "Community Haven",
        label: "The name of the Discord server"
    },
    {
        key: "channel.name",
        mockValue: "general-chat",
        label: "The channel where the reported content was located"
    },
    {
        key: "message.snippet",
        mockValue: "Get cheap coins at this link...",
        label: "A brief snippet of the reported message content"
    },
    {
        key: "report.id",
        mockValue: "1024",
        label: "The system ID of the filed report"
    }
];
export const REPORT_DM_CONFIGS: Record<ReportTabValue, BuilderConfig> = {
    RESOLVED_DM: {
        id: "report_resolved",
        name: "Report Actioned",
        description: "Sent to the reporting user when a moderator takes action on their report.",
        placeholders: REPORT_PLACEHOLDER_METADATA,
    },
    DISMISSED_DM: {
        id: "report_dismissed",
        name: "Report Dismissed",
        description: "Sent to the reporting user when a moderator reviews and dismisses their report.",
        placeholders: REPORT_PLACEHOLDER_METADATA,
    },
};