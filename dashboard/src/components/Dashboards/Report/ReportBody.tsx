"use client";

import { ReportConfig } from "@/types/config";
import { DiscordChannel } from "@/types";
import { ReportedMessage } from "@/types/reports";
import { useMemo, useState } from "react";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { useSSEInfiniteScroll } from "@/hooks/useSSEInfiniteScroll";
import { useReportActions } from "@/hooks/useReportActions";
import { fetchMoreReports } from "@/actions/reports";
import { ImageModal } from "@/components/Dashboards/General/ImageModal";
import { ReportedMessageCard } from "./ReportMessageCard/ReportedMessageCard";
import { TimeoutModal } from "@/components/Dashboards/Report/Modals/TimeoutModal";
import { WarnModal } from "@/components/Dashboards/Report/Modals/WarnModal";
import { BanModal } from "@/components/Dashboards/Report/Modals/BanModal";
import { useConfigForm } from "@/hooks/useConfigForm";

// New imports for tabs and message customization
import { TabItem, Tabs } from "@/components/Tabs";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { BuilderConfig } from "@/types/builder";

// Define our DM tabs for reports
type ReportTabValue = "resolved_dm" | "dismissed_dm";

const REPORT_DM_TABS: TabItem<ReportTabValue>[] = [
    { value: "resolved_dm", label: "Report Actioned" },
    { value: "dismissed_dm", label: "Report Dismissed" },
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

// 2. The default text templates (indexed by ReportTabValue)
const REPORT_PLACEHOLDER_TEXTS: Record<ReportTabValue, string> = {
    resolved_dm: "Your report regarding message ID {report.id} has been reviewed and action has been taken. Thank you for helping keep the server safe!",
    dismissed_dm: "Your report regarding message ID {report.id} has been reviewed and dismissed.",
};

// 3. The BuilderConfigs (indexed by ReportTabValue)
export const REPORT_DM_CONFIGS: Record<ReportTabValue, BuilderConfig> = {
    resolved_dm: {
        id: "report_resolved",
        name: "Report Actioned",
        description: "Sent to the reporting user when a moderator takes action on their report.",
        placeholders: REPORT_PLACEHOLDER_METADATA,
    },
    dismissed_dm: {
        id: "report_dismissed",
        name: "Report Dismissed",
        description: "Sent to the reporting user when a moderator reviews and dismisses their report.",
        placeholders: REPORT_PLACEHOLDER_METADATA,
    },
};


interface ReportBodyConfig {
    reportConfig: ReportConfig;
    channels: DiscordChannel[];
    initialReports: ReportedMessage[];
    guildId: string;
    onSave: (config: ReportConfig) => Promise<void>;
}

export function ReportBody({
    reportConfig,
    channels,
    initialReports,
    guildId,
    onSave,
}: ReportBodyConfig) {
    const normalizedReportConfig = useMemo(() => reportConfig, [reportConfig]);

    const {
        config,
        isPending,
        isDirty,
        resetKey,
        setIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm({
        initialConfig: normalizedReportConfig,
        onSave,
    });

    const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<"all" | "opened" | "closed">("all");
    const [activeDmTab, setActiveDmTab] = useState<ReportTabValue>("resolved_dm");

    const {
        deletingIds,
        resolvingIds,
        timeoutReportId,
        setTimeoutReportId,
        isTimingOut,
        banReportId,
        setBanReportId,
        isBanning,
        warnReportId,
        setWarnReportId,
        isWarning,
        handleDeleteMessage,
        handleResolveReport,
        handleTimeoutUser,
        handleWarnUser,
        handleBanUser,
    } = useReportActions();

    const { logs, status, isLoadingMore, observerTarget } = useSSEInfiniteScroll<ReportedMessage>({
        sseUrl: `http://localhost:8080/api/sse/events?guild_id=${guildId}`,
        initialHistory: initialReports,
        guildId: guildId,
        fetchMoreAction: fetchMoreReports,
        eventName: "message-report",
    });

    const filteredLogs = useMemo(() => {
        return logs.filter((log) => {
            const currentStatus = log.status?.toLowerCase();
            if (statusFilter === "opened") {
                return currentStatus === "under_review";
            }
            if (statusFilter === "closed") {
                return currentStatus === "actioned" || currentStatus === "dismissed";
            }
            return true;
        });
    }, [logs, statusFilter]);

    return (
        <div className="flex-1 scrollbar-thin pr-2 pb-12 space-y-6">
            <ToggleSwitch
                enabled={config.enabled}
                onChange={v => handleChange({ enabled: v })}
                disabled={false}
                text="Enable Reporting"
            />

            {/* 2. Notification Preferences Card */}
            {config.enabled && (
                <div className="border rounded-xl p-4 space-y-6">
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
                            toggleLabel={`Enable DM when Report is ${activeDmTab === "resolved_dm" ? "Actioned" : "Dismissed"}`}
                            embedTemplateConfig={REPORT_DM_CONFIGS[activeDmTab]}
                            resetKey={`${resetKey}_${activeDmTab}`}
                            modeLabel={`Message Mode (${activeDmTab === "resolved_dm" ? "Actioned" : "Dismissed"})`}
                            placeholderText={REPORT_PLACEHOLDER_TEXTS[activeDmTab]}
                            setIsEmpty={setIsEmpty}
                            noChannels
                        />
                    </div>
                </div>
            )}

            {config.enabled && (
                <div className="border rounded-xl p-6 flex flex-col space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <h3 className="text-lg font-semibold">Recent Reports</h3>
                            <div className="flex items-center space-x-1.5">
                                <span
                                    className={`h-2 w-2 rounded-full ${
                                        status === "connected" ? "bg-emerald-500" :
                                            status === "connecting" ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                                    }`}
                                />
                                <span className="text-[10px] uppercase tracking-wider text-zinc-400">{status}</span>
                            </div>
                        </div>

                        <div className="flex items-center space-x-1 bg-neutral-200/50 dark:bg-neutral-800/50 p-1 rounded-lg text-xs self-start sm:self-auto border border-neutral-300 dark:border-neutral-700">
                            <button
                                type="button"
                                onClick={() => setStatusFilter("all")}
                                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                                    statusFilter === "all"
                                        ? "bg-white dark:bg-zinc-700 shadow text-neutral-900 dark:text-white"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                                }`}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter("opened")}
                                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                                    statusFilter === "opened"
                                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-neutral-200 border border-transparent"
                                }`}
                            >
                                Opened
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter("closed")}
                                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                                    statusFilter === "closed"
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-neutral-200 border border-transparent"
                                }`}
                            >
                                Closed
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 max-h-125 overflow-y-auto scrollbar-thin p-4 rounded-xl border border-neutral-500">
                        {filteredLogs.length === 0 ? (
                            <p className="text-sm text-zinc-500 py-12 text-center">
                                {statusFilter === "opened"
                                    ? "No open reports."
                                    : statusFilter === "closed"
                                        ? "No closed reports."
                                        : "No reports recorded yet."}
                            </p>
                        ) : (
                            filteredLogs.map((log) => (
                                <ReportedMessageCard
                                    key={log.id}
                                    log={log}
                                    isDeleting={deletingIds.has(log.id)}
                                    isResolving={resolvingIds.has(log.id)}
                                    onDelete={handleDeleteMessage}
                                    onResolve={handleResolveReport}
                                    onTimeoutClick={setTimeoutReportId}
                                    onBanClick={setBanReportId}
                                    onWarnClick={setWarnReportId}
                                    onImageClick={setActiveImageUrl}
                                />
                            ))
                        )}

                        <div ref={observerTarget} className="h-4 w-full">
                            {isLoadingMore ? (
                                <p className="text-center text-xs text-zinc-500">Loading older records...</p>
                            ) : <p className="text-center text-xs text-zinc-500 pt-2">That's everything for you.</p>}
                        </div>
                    </div>
                </div>
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}

            <TimeoutModal
                isOpen={timeoutReportId !== null}
                onClose={() => setTimeoutReportId(null)}
                onSubmit={handleTimeoutUser}
                isSubmitting={isTimingOut}
            />

            <WarnModal
                isOpen={warnReportId !== null}
                onClose={() => setWarnReportId(null)}
                onSubmit={handleWarnUser}
                isSubmitting={isWarning}
            />

            <BanModal
                isOpen={banReportId !== null}
                onClose={() => setBanReportId(null)}
                onSubmit={handleBanUser}
                isSubmitting={isBanning}
            />

            {activeImageUrl && (
                <ImageModal src={activeImageUrl} onClose={() => setActiveImageUrl(null)}/>
            )}
        </div>
    );
}