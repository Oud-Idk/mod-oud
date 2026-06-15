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
import { deleteReportedMessage, fetchMoreReports } from "@/actions/reports";
import Image from "next/image";
import { ImageModal } from "@/components/Dashboards/General/ImageModal";

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
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

    const [statusFilter, setStatusFilter] = useState<"all" | "opened" | "closed">("all");

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

    const handleDeleteMessage = async (reportId: number, channelId: string, messageId: string) => {
        if (deletingIds.has(reportId)) return;

        setDeletingIds((prev) => {
            const next = new Set(prev);
            next.add(reportId);
            return next;
        });

        const result = await deleteReportedMessage(reportId, channelId, messageId);

        setDeletingIds((prev) => {
            const next = new Set(prev);
            next.delete(reportId);
            return next;
        });

        if (!result.success) {
            alert("Error sending delete instruction. Please try again.");
        }
    };

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

                    {/* Header and Control Row */}
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

                        {/* === ADDED: Visual Filter Tabs === */}
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
                        {/* === CHANGED: Render filteredLogs instead of logs === */}
                        {filteredLogs.length === 0 ? (
                            <p className="text-sm text-zinc-500 py-8 text-center">
                                {statusFilter === "opened"
                                    ? "No open reports."
                                    : statusFilter === "closed"
                                        ? "No closed reports."
                                        : "No reports recorded yet."}
                            </p>
                        ) : (
                            filteredLogs.map((log) => {
                                const isDeleting = deletingIds.has(log.id);
                                const isActioned = log.status?.toLowerCase() === "actioned";

                                return (
                                    <div
                                        key={log.id}
                                        className="p-3 border border-neutral-500 rounded-lg space-y-2 text-sm dark:bg-[#121212] bg-[#fcfcfc]"
                                    >
                                        <div className="flex justify-between items-center m-0">
                                            <span className="font-semibold text-lg">Report ID: #{log.id}</span>
                                            <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                                    log.status?.toLowerCase() === "under_review" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                                                        isActioned ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                                                            "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                                                }`}
                                            >
                                                {log.status?.replace("_", " ")}
                                            </span>
                                        </div>
                                        <div className="text-sm mb-0">
                                            Author: <code
                                            className="py-0.5 rounded"
                                        >{log.author_name}</code>{" "}&nbsp;|&nbsp;
                                            Reporter: <code className="py-0.5 rounded">{log.reporter_name}</code>
                                        </div>
                                        {log.message_content.trim() !== "" && (
                                            <div className="p-1 rounded text-[0.9rem] my-1">
                                                "{log.message_content}" </div>
                                        )}
                                        <div className="mb-0">
                                            Reason: {log.reason}
                                        </div>
                                        {log.attachment_url && (
                                            <div>
                                                <p>Attachments:</p>
                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                    {log.attachment_url.split(",").map((url, idx) => {
                                                        const trimmedUrl = url.trim();
                                                        return (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => setActiveImageUrl(trimmedUrl)}
                                                                className="group relative block overflow-hidden rounded border border-neutral-800/50 hover:border-neutral-500/50 cursor-zoom-in text-left"
                                                            >
                                                                <Image
                                                                    src={trimmedUrl}
                                                                    alt={`Attachment ${idx}`}
                                                                    className="text-xs hover:underline px-2 py-0.5 rounded border"
                                                                    width={200}
                                                                    height={200}
                                                                />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <div
                                            className="pt-2 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-end"
                                        >
                                            {isActioned ? (
                                                <span
                                                    className="text-xs text-emerald-500 font-semibold flex items-center gap-1"
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        className="h-4 w-4"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                    Message Deleted
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMessage(log.id, log.channel_id, log.message_id)}
                                                    disabled={isDeleting}
                                                    className="px-3 py-1 text-xs font-semibold rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                                                >
                                                    {isDeleting ? "Deleting..." : "Delete Message"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        <div ref={observerTarget} className="h-4 w-full">
                            {isLoadingMore ? (
                                <p className="text-center text-xs text-zinc-500">Loading older records...</p>
                            ) : <p className="text-center text-xs text-zinc-500">That's everything for you.</p>}
                        </div>
                    </div>
                </div>
            )}

            {activeImageUrl && (
                <ImageModal src={activeImageUrl} onClose={() => setActiveImageUrl(null)}/>
            )}
        </div>
    );
}