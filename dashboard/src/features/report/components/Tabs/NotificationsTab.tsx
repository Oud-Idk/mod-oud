import React, { Dispatch, JSX, SetStateAction } from "react";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { ReportConfig } from "@/features/report/types";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { REPORT_DM_CONFIGS } from "@/features/report/builderConfigs";

interface NotificationsTabProps {
    activeDmTab: ReportTabValue;
    setActiveDmTab: Dispatch<SetStateAction<ReportTabValue>>;
    config: ReportConfig;
    handleChange: (updated: Partial<ReportConfig> | ReportConfig) => void;
    isPending: boolean;
    resetKey: number;
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
}: NotificationsTabProps): JSX.Element {
    const activeKey = TAB_TO_CONFIG_KEY[activeDmTab];

    return (
        <div>
            <Tabs
                tabs={REPORT_DM_TABS}
                activeTab={activeDmTab}
                onChange={setActiveDmTab}
            />

            <div className="mt-4">
                <MessageConfigEditor
                    config={config[activeKey].message}
                    onChange={(updated) =>{ 
                        handleChange({
                            [activeKey]: {
                                enabled: updated.enabled,
                                content: updated.content,
                                embed: updated.embed,
                                format: updated.format,
                            },
                        }); }
                    }
                    disabled={isPending}
                    toggleLabel={`Enable DM when Report is ${
                        activeDmTab === "RESOLVED_DM" ? "Actioned" : "Dismissed"
                    }`}
                    embedTemplateConfig={REPORT_DM_CONFIGS[activeDmTab]}
                    resetKey={`${resetKey}_${activeDmTab}`}
                    modeLabel={`Message Mode (${
                        activeDmTab === "RESOLVED_DM" ? "Actioned" : "Dismissed"
                    })`}
                    placeholderText={REPORT_PLACEHOLDER_TEXTS[activeDmTab]}
                    noChannels
                />
            </div>
        </div>
    );
}