"use client";

import React, { useMemo, useState, useCallback, JSX } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useSSEInfiniteScroll } from "@/lib/hooks/useSSEInfiniteScroll";
import { useReportActions } from "../hooks";
import { fetchMoreReportsAction } from "../actions";
import { TimeoutModal } from "./Modals/TimeoutModal";
import { WarnModal } from "./Modals/WarnModal";
import { BanModal } from "./Modals/BanModal";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { Modal } from "@/components/ui/Modal";
import { HistoryTab } from "./Tabs/HistoryTab";
import { NotificationsTab, type ReportTabValue } from "./Tabs/NotificationsTab";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import type { ReportConfig, ReportedMessage } from "../types";
import { reportConfigSchema } from "../types";
import type { ViewTicketStatus } from "@/features/tickets/types";
import type { DiscordChannel } from "@/features/_shared/channels.types";
import { getAvailableChannelOptions } from "@/features/_shared/dropdown";
import { Dropdown } from "@/components/ui/Dropdown";
import { InputLabel } from "@/components/layout/InputLabel";
import { toast } from "sonner";
import Image from "next/image";

interface ReportBodyProps {
    reportConfig: ReportConfig;
    channels: DiscordChannel[];
    initialReports: ReportedMessage[];
    guildId: string;
    onSave: (config: ReportConfig) => Promise<void>;
    textChannelMap: Record<string, string>;
}

export type ReportMainTab = "HISTORY" | "REPORTER_NOTIFICATIONS" | "MODERATOR_NOTIFICATIONS";

const MAIN_REPORT_TABS: TabItem<ReportMainTab>[] = [
    { value: "HISTORY", label: "Report History" },
    { value: "REPORTER_NOTIFICATIONS", label: "Reporter Notifications" },
    { value: "MODERATOR_NOTIFICATIONS", label: "Moderator Notifications" },
];

export function ReportBody({
    reportConfig,
    initialReports,
    guildId,
    onSave,
    textChannelMap,
}: ReportBodyProps): JSX.Element {
    const {
        config,
        setConfig,
        isPending,
        isDirty,
        resetKey,
        handleSave: originalHandleSave,
        handleCancel,
    } = useConfigForm<ReportConfig>({
        initialConfig: reportConfig,
        onSave,
    });

    const handleSave = useCallback(() => {
        const result = reportConfigSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0].message);
            return;
        }
        originalHandleSave();
    }, [config, originalHandleSave]);

    const handleChange = useCallback((updated: Partial<ReportConfig>) => {
        setConfig((prev) => ({ ...prev, ...updated }));
    }, [setConfig]);

    const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<ViewTicketStatus>("OPEN");
    const [activeDmTab, setActiveDmTab] = useState<ReportTabValue>("RESOLVED_DM");
    const [activeMainTab, setActiveMainTab] = useState<ReportMainTab>("HISTORY");

    const channelOptions = useMemo(() => {
        return [
            { value: "", label: "None (Disabled)" },
            ...getAvailableChannelOptions(textChannelMap),
        ];
    }, [textChannelMap]);

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
    } = useReportActions(guildId);

    const { logs, status, isLoadingMore, observerTarget } = useSSEInfiniteScroll<ReportedMessage>({
        sseUrl: `/api/sse/events?guild_id=${guildId}`,
        initialHistory: initialReports,
        guildId,
        fetchMoreAction: (gid, beforeId) => fetchMoreReportsAction(gid, beforeId),
        eventName: "message-report",
    });

    const filteredLogs = useMemo(() => {
        return logs.filter((log) => {
            const currentStatus = log.status.toLowerCase();
            if (statusFilter === "OPEN") {
                return currentStatus === "under_review";
            }
            if (statusFilter === "CLOSED") {
                return currentStatus === "actioned" || currentStatus === "dismissed";
            }
            return true;
        });
    }, [logs, statusFilter]);

    return (
        <div className="flex-1 scrollbar-thin space-y-4">
            <ToggleSwitch
                checked={config.enabled}
                onChange={(v) => { handleChange({ enabled: v }); }}
                disabled={false}
                text="Enable Reporting"
            />

            {config.enabled && (
                <Tabs
                    tabs={MAIN_REPORT_TABS}
                    activeTab={activeMainTab}
                    onChange={setActiveMainTab}
                />
            )}

            {config.enabled && activeMainTab === "REPORTER_NOTIFICATIONS" && (
                <NotificationsTab
                    activeDmTab={activeDmTab}
                    setActiveDmTab={setActiveDmTab}
                    config={config}
                    handleChange={handleChange}
                    isPending={isPending}
                    resetKey={resetKey}
                />
            )}

            {config.enabled && activeMainTab === "HISTORY" && (
                <HistoryTab
                    status={status}
                    setStatusFilter={setStatusFilter}
                    statusFilter={statusFilter}
                    filteredLogs={filteredLogs}
                    deletingIds={deletingIds}
                    resolvingIds={resolvingIds}
                    handleDeleteMessage={handleDeleteMessage}
                    handleResolveReport={handleResolveReport}
                    setTimeoutReportId={setTimeoutReportId}
                    setBanReportId={setBanReportId}
                    setWarnReportId={setWarnReportId}
                    setActiveImageUrl={setActiveImageUrl}
                    observerTarget={observerTarget}
                    isLoadingMore={isLoadingMore}
                />
            )}

            {config.enabled && activeMainTab === "MODERATOR_NOTIFICATIONS" && (
                <div>
                    <InputLabel>Send a Message for Every Report to</InputLabel>
                    <Dropdown
                        value={config.reportingChannel ?? ""}
                        onChange={(c) => { handleChange({ reportingChannel: c }); }}
                        options={channelOptions}
                        placeholder="Select a channel..."
                    />
                </div>
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={() => { handleSave(); }}
                    isSaving={isPending}
                />
            )}

            <TimeoutModal
                isOpen={timeoutReportId !== null}
                onClose={() => { setTimeoutReportId(null); }}
                onSubmit={handleTimeoutUser}
                isSubmitting={isTimingOut}
            />

            <WarnModal
                isOpen={warnReportId !== null}
                onClose={() => { setWarnReportId(null); }}
                onSubmit={handleWarnUser}
                isSubmitting={isWarning}
            />

            <BanModal
                isOpen={banReportId !== null}
                onClose={() => { setBanReportId(null); }}
                onSubmit={(time, reason) => { void handleBanUser(time, reason); }}
                isSubmitting={isBanning}
            />

            {activeImageUrl !== null && (
                <Modal
                    headerText="Attachment Preview"
                    onClose={() => { setActiveImageUrl(null); }}
                >
                    <div className="flex justify-center items-center overflow-hidden max-h-[75vh]">
                        <Image
                            src={activeImageUrl}
                            alt="Attachment Preview"
                            className="max-w-full max-h-[65vh] object-contain rounded-lg"
                            width={400}
                            height={400}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
}