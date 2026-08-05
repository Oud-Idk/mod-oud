import React, { Dispatch, SetStateAction } from "react";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { ReportConfig } from "@/features/report/types";
import { ModerationDMsConfig } from "@/features/moderation-dms/types";
import { BuilderConfig } from "@/features/_shared/builderConfig";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";

interface NotificationsTabProps {
    activeDmTab: ReportTabValue;
    setActiveDmTab: Dispatch<SetStateAction<ReportTabValue>>;
    config: ReportConfig;
    handleChange: (updated: Partial<ReportConfig> | ReportConfig) => void;
    isPending: boolean;
    resetKey: number;
    setIsEmpty: Dispatch<SetStateAction<boolean>>;
}

export type ReportTabValue = "RESOLVED_DM" | "DISMISSED_DM";

const REPORT_PLACEHOLDER_TEXTS: Record<ReportTabValue, string> = {
    RESOLVED_DM: "Your report regarding message ID {report.id} has been reviewed and action has been taken. Thank you for helping keep the server safe!",
    DISMISSED_DM: "Your report regarding message ID {report.id} has been reviewed and dismissed.",
};

const REPORT_DM_TABS: TabItem<ReportTabValue>[] = [
    { value: "RESOLVED_DM", label: "Report Actioned" },
    { value: "DISMISSED_DM", label: "Report Dismissed" },
];

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


const TAB_TO_CONFIG_KEY = {
    RESOLVED_DM: "resolvedDm",
    DISMISSED_DM: "dismissedDm",
} satisfies Record<ReportTabValue, keyof ReportConfig>;

export function NotificationsTab({
    activeDmTab,
    setActiveDmTab,
    config,
    handleChange,
    isPending,
    resetKey,
    setIsEmpty,
}: NotificationsTabProps) {
    const activeKey = TAB_TO_CONFIG_KEY[activeDmTab];

    return <div className="space-y-6 px-4 mt-4">
        <div>
            <h3 className="text-lg font-semibold">Reporter Notifications</h3>
            <p className="text-sm text-zinc-500">
                Customize the messages sent to users who report content when their report status
                changes. </p>
        </div>

        <Tabs
            tabs={REPORT_DM_TABS} activeTab={activeDmTab} onChange={setActiveDmTab}
        />

        <div className="mt-4">
            <MessageConfigEditor
                config={config[activeKey]}
                onChange={(updated) =>
                    handleChange({
                        [activeDmTab]: {
                            enabled: updated.enabled,
                            content: updated.content,
                            embed: updated.embed,
                            format: updated.format,
                        }
                    })
                }
                onEmbedChange={(embed) =>
                    handleChange({
                        [activeDmTab]: {
                            ...config[activeKey],
                            embed
                        }
                    })
                }
                disabled={isPending}
                toggleLabel={`Enable DM when Report is ${activeDmTab === "RESOLVED_DM" ? "Actioned" : "Dismissed"}`}
                embedTemplateConfig={REPORT_DM_CONFIGS[activeDmTab]}
                resetKey={`${resetKey}_${activeDmTab}`}
                modeLabel={`Message Mode (${activeDmTab === "RESOLVED_DM" ? "Actioned" : "Dismissed"})`}
                placeholderText={REPORT_PLACEHOLDER_TEXTS[activeDmTab]}
                setIsEmpty={setIsEmpty}
                noChannels
            />
        </div>
    </div>;
}