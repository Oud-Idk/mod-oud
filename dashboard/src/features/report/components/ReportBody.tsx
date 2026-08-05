"use client";

import React, { useMemo, useState } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useSSEInfiniteScroll } from "@/lib/hooks/useSSEInfiniteScroll";
import { useReportActions } from "@/features/report/hooks";
import { fetchMoreReports } from "@/features/report/actions";
import { TimeoutModal } from "@/features/report/components/Modals/TimeoutModal";
import { WarnModal } from "@/features/report/components/Modals/WarnModal";
import { BanModal } from "@/features/report/components/Modals/BanModal";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { Modal } from "@/components/ui/Modal";
import { HistoryTab } from "@/features/report/components/Tabs/HistoryTab";
import { NotificationsTab, ReportTabValue } from "@/features/report/components/Tabs/NotificationsTab";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { ReportConfig, ReportedMessage } from "@/features/report/types";
import { ViewTicketStatus } from "@/features/tickets/types";


import { DiscordChannel } from "@/features/_shared/channels.types";

interface ReportBodyConfig {
    reportConfig: ReportConfig;
    channels: DiscordChannel[];
    initialReports: ReportedMessage[];
    guildId: string;
    onSave: (config: ReportConfig) => Promise<void>;
}

export type ReportMainTab = "HISTORY" | "NOTIFICATIONS";

const MAIN_REPORT_TABS: TabItem<ReportMainTab>[] = [
    { value: "HISTORY", label: "Report History" },
    { value: "NOTIFICATIONS", label: "Reporter Notifications" },
];

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
    const [statusFilter, setStatusFilter] = useState<ViewTicketStatus>("OPEN");
    const [activeDmTab, setActiveDmTab] = useState<ReportTabValue>("RESOLVED_DM");

    // This state controls which main sub-tab is currently active
    const [activeMainTab, setActiveMainTab] = useState<ReportMainTab>("HISTORY");

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
            if (statusFilter === "OPEN") {
                return currentStatus === "UNDER_REVIEW";
            }
            if (statusFilter === "CLOSED") {
                return currentStatus === "ACTIONED" || currentStatus === "DISMISSED";
            }
            return true;
        });
    }, [logs, statusFilter]);

    return (
        <div className="flex-1 scrollbar-thin space-y-4">
            <ToggleSwitch
                checked={config.enabled}
                onChange={v => handleChange({ enabled: v })}
                disabled={false}
                text="Enable Reporting"
            />

            {/* If reporting is enabled, show the high-level tab selector */}
            {config.enabled && (
                <Tabs
                    tabs={MAIN_REPORT_TABS} activeTab={activeMainTab} onChange={setActiveMainTab}
                />
            )}

            {/* Conditionally render the active tab view */}
            {config.enabled && activeMainTab === "NOTIFICATIONS" && (
                <NotificationsTab
                    activeDmTab={activeDmTab}
                    setActiveDmTab={setActiveDmTab}
                    config={config}
                    handleChange={handleChange}
                    isPending={isPending}
                    resetKey={resetKey}
                    setIsEmpty={setIsEmpty}
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
                <Modal
                    headerText="Attachment Preview" onClose={() => setActiveImageUrl(null)}
                >
                    <div className="flex justify-center items-center overflow-hidden max-h-[75vh]">
                        <img
                            src={activeImageUrl}
                            alt="Attachment Preview"
                            className="max-w-full max-h-[65vh] object-contain rounded-lg"
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
}