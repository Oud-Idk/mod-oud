import React, { Dispatch, SetStateAction } from "react";
import { ReportConfig } from "@/types/db/config";
import { TabItem, Tabs } from "@/components/Layout/Tabs";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { BuilderConfig } from "@/types/builder";

interface NotificationsTabProps {
    activeDmTab: ReportTabValue; // Keep using SCREAMING_SNAKE_CASE!
    setActiveDmTab: Dispatch<SetStateAction<ReportTabValue>>;
    config: ReportConfig;
    handleChange: (updated: Partial<ReportConfig> | ReportConfig) => void;
    isPending: boolean;
    resetKey: number;
    setIsEmpty: Dispatch<SetStateAction<boolean>>;
}

export type ReportTabValue = "resolvedDm" | "dismissedDm";

const REPORT_PLACEHOLDER_TEXTS: Record<ReportTabValue, string> = {
    resolvedDm: "Your report regarding message ID {report.id} has been reviewed and action has been taken. Thank you for helping keep the server safe!",
    dismissedDm: "Your report regarding message ID {report.id} has been reviewed and dismissed.",
};

const REPORT_DM_TABS: TabItem<ReportTabValue>[] = [
    { value: "resolvedDm", label: "Report Actioned" },
    { value: "dismissedDm", label: "Report Dismissed" },
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
    resolvedDm: {
        id: "report_resolved",
        name: "Report Actioned",
        description: "Sent to the reporting user when a moderator takes action on their report.",
        placeholders: REPORT_PLACEHOLDER_METADATA,
    },
    dismissedDm: {
        id: "report_dismissed",
        name: "Report Dismissed",
        description: "Sent to the reporting user when a moderator reviews and dismisses their report.",
        placeholders: REPORT_PLACEHOLDER_METADATA,
    },
};

export function NotificationsTab({
    activeDmTab,
    setActiveDmTab,
    config,
    handleChange,
    isPending,
    resetKey,
    setIsEmpty,
}: NotificationsTabProps) {
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
                config={config[activeDmTab]}
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
                            ...config[activeDmTab],
                            embed
                        }
                    })
                }
                disabled={isPending}
                toggleLabel={`Enable DM when Report is ${activeDmTab === "resolvedDm" ? "Actioned" : "Dismissed"}`}
                embedTemplateConfig={REPORT_DM_CONFIGS[activeDmTab]}
                resetKey={`${resetKey}_${activeDmTab}`}
                modeLabel={`Message Mode (${activeDmTab === "resolvedDm" ? "Actioned" : "Dismissed"})`}
                placeholderText={REPORT_PLACEHOLDER_TEXTS[activeDmTab]}
                setIsEmpty={setIsEmpty}
                noChannels
            />
        </div>
    </div>;
}