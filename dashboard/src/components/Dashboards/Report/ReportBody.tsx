"use client";

import { ReportConfig } from "@/types/config";
import { DiscordChannel } from "@/types";
import { ReportedMessage } from "@/types/reports";
import { useCallback, useMemo, useState, useTransition } from "react";
import { isDeepEqual } from "@/utils/embed";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { ChannelSelector } from "@/components/Dashboards/General/ChannelSelector";
import { Pad } from "@/components/Pad";
import { useSSEInfiniteScroll } from "@/hooks/useSSEInfiniteScroll";
import { useReportActions } from "@/hooks/useReportActions"; // Import our fresh hook
import { fetchMoreReports } from "@/actions/reports";
import { ImageModal } from "@/components/Dashboards/General/ImageModal";
import { ReportedMessageCard } from "./ReportMessageCard/ReportedMessageCard";
import { TimeoutModal } from "@/components/Dashboards/Report/Modals/TimeoutModal";
import { WarnModal } from "@/components/Dashboards/Report/Modals/WarnModal";
import { BanModal } from "@/components/Dashboards/Report/Modals/BanModal";

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

    const [config, setConfig] = useState<ReportConfig>(normalizedReportConfig);
    const [isPending, startTransition] = useTransition();
    const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<"all" | "opened" | "closed">("all");

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

    const isDirty = !isDeepEqual(config, normalizedReportConfig);

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

    const handleSave = () => {
        startTransition(async () => {
            await onSave(config);
        });
    };

    const handleCancel = () => {
        setConfig(normalizedReportConfig);
    };

    const handleChange = useCallback((updated: Partial<ReportConfig>) => {
        setConfig((prev) => ({
            ...prev,
            ...updated,
        }));
    }, []);

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div>
                <ToggleSwitch
                    enabled={config.enabled}
                    onChange={v => handleChange({ enabled: v })}
                    disabled={false}
                    text="Enable Reporting"
                />
                <Pad/>
                {config.enabled && (
                    <ChannelSelector
                        channels={channels}
                        value={config.reporting_channel || ""}
                        disabled={false}
                        onChange={(value) => handleChange({ reporting_channel: value })}
                    />
                )}
                {isDirty && (
                    <SavePopup
                        handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                    />
                )}
            </div>

            {config.enabled && (
                <div className="border-t border-neutral-500 pt-4 flex-1 flex flex-col min-h-0">

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
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

                        <div
                            className="flex items-center space-x-1 bg-neutral-200/50 dark:bg-neutral-800/50 p-1 rounded-lg text-xs self-start sm:self-auto border border-neutral-300 dark:border-neutral-700"
                        >
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

                    <div
                        className="space-y-4 overflow-y-auto pr-4 scrollbar-thin p-4 bg-neutral-300/10 border-neutral-200 dark:border-neutral-700 rounded-xl rounded-r-none border"
                    >
                        {filteredLogs.length === 0 ? (
                            <p className="text-sm text-zinc-500 py-8 text-center">
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
                            ) : <p className="text-center text-xs text-zinc-500">That's everything for you.</p>}
                        </div>
                    </div>
                </div>
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