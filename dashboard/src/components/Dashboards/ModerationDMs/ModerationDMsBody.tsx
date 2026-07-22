"use client";

import { JSX, useMemo, useState } from "react";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import {
    BAN_CONFIG,
    HONEYPOT_CONFIG,
    KICK_CONFIG,
    MUTE_CONFIG,
    PARDON_WARN_CONFIG,
    SOFTBAN_CONFIG,
    UNMUTE_CONFIG,
    UNPARDON_DELETE_WARN_CONFIG,
    UNPARDON_WARN_CONFIG,
    WARN_CONFIG
} from "@/utils/embedTemplates";
import { TabItem, Tabs } from "@/components/Layout/Tabs";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { ModerationDMsConfig } from "@/types/db/config/moderationDMs";
import { BuilderConfig } from "@/types/builder";
import { useConfigForm } from "@/hooks/useConfigForm";
import { isDeepEqual } from "@/utils/embed";

interface ModerationDMsBodyProps {
    moderationDMsConfig: ModerationDMsConfig;
    onSave: (config: ModerationDMsConfig) => Promise<void>;
}

type TabValue =
    | "warn"
    | "pardon_warn"
    | "unpardon_warn"
    | "unpardon_delete_warn"
    | "mute"
    | "unmute"
    | "kick"
    | "ban"
    | "softban"
    | "honeypot";

const MODERATION_DM_TABS: TabItem<TabValue>[] = [
    { value: "warn", label: "Warn" },
    { value: "pardon_warn", label: "Pardon Warn" },
    { value: "unpardon_warn", label: "Unpardon Warn" },
    { value: "unpardon_delete_warn", label: "Unpardon + Delete" },
    { value: "mute", label: "Mute" },
    { value: "unmute", label: "Unmute" },
    { value: "kick", label: "Kick" },
    { value: "ban", label: "Ban" },
    { value: "softban", label: "Softban" },
    { value: "honeypot", label: "Honeypot" },
];

const PLACEHOLDERS: Record<TabValue, string> = {
    warn: "You have been warned in {server.name} for: {reason}",
    pardon_warn: "Your warning in {server.name} has been pardoned.",
    unpardon_warn: "Your warning in {server.name} has been reinstated.",
    unpardon_delete_warn: "Your warning in {server.name} has been deleted.",
    mute: "You have been muted in {server.name} for {duration}. Reason: {reason}",
    unmute: "You have been unmuted in {server.name}.",
    kick: "You have been kicked from {server.name}. Reason: {reason}",
    ban: "You have been banned from {server.name}. Reason: {reason} | Appeal: {appeal_link}",
    softban: "You have been softbanned from {server.name}. Reason: {reason}",
    honeypot: "You have been banned from the {server.name} due to sending a message in a honeypot channel",
};

const MODERATION_DM_CONFIGS: Record<TabValue, BuilderConfig> = {
    warn: WARN_CONFIG,
    pardon_warn: PARDON_WARN_CONFIG,
    unpardon_warn: UNPARDON_WARN_CONFIG,
    unpardon_delete_warn: UNPARDON_DELETE_WARN_CONFIG,
    mute: MUTE_CONFIG,
    unmute: UNMUTE_CONFIG,
    kick: KICK_CONFIG,
    ban: BAN_CONFIG,
    softban: SOFTBAN_CONFIG,
    honeypot: HONEYPOT_CONFIG,
};

export function ModerationDMsBody({
    moderationDMsConfig,
    onSave
}: ModerationDMsBodyProps): JSX.Element {
    const normalizedConfig = useMemo(() => moderationDMsConfig, [moderationDMsConfig]);
    const [activeTab, setActiveTab] = useState<TabValue>("warn");

    const {
        config,
        setConfig,
        isPending,
        resetKey,
        setIsEmpty, // Handled but overridden locally below
        handleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: normalizedConfig,
        onSave,
    });

    // Check if ANY enabled tab in the entire configuration contains an empty message
    const hasAnyEnabledEmptyTab = useMemo(() => {
        return Object.values(config).some((tabConfig) => {
            // Disabled tabs are not validated since they will not be sent
            if (!tabConfig || tabConfig.enabled === false) return false;

            // Plaintext validation
            if (tabConfig.format === "TEXT") {
                return !tabConfig.content || tabConfig.content.trim() === "";
            }

            // Embed validation (checking if all main fields are empty)
            const embed = tabConfig.embed;
            if (!embed) return true;

            const hasTitle = !!embed.title?.trim();
            const hasDesc = !!embed.description?.trim();
            const hasFields = Array.isArray(embed.fields) && embed.fields.length > 0;
            const hasAuthor = !!embed.author?.name?.trim();
            const hasFooter = !!embed.footer?.text?.trim();
            const hasImage = !!embed.image?.url?.trim();
            const hasThumbnail = !!embed.thumbnail?.url?.trim();

            return !(hasTitle || hasDesc || hasFields || hasAuthor || hasFooter || hasImage || hasThumbnail);
        });
    }, [config]);

    // Dirty state is only true if things have changed AND there are absolutely no invalid (empty) enabled tabs
    const isDirty = !isDeepEqual(config, normalizedConfig) && !hasAnyEnabledEmptyTab;

    return (
        <div>
            <Tabs tabs={MODERATION_DM_TABS} activeTab={activeTab} onChange={setActiveTab}/>

            <MessageConfigEditor
                config={config[activeTab]}
                onChange={(updated) =>
                    setConfig((prev) => ({
                        ...prev,
                        [activeTab]: {
                            enabled: updated.enabled,
                            content: updated.content,
                            embed: updated.embed,
                            format: updated.format,
                        }
                    }))
                }
                onEmbedChange={(embed) =>
                    setConfig((prev) => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab], embed }
                    }))
                }
                disabled={isPending}
                toggleLabel={`Apply Custom Direct Messages for ${activeTab.charAt(0).toUpperCase() + activeTab.replace(/_/g, " ").slice(1)}s`}
                embedTemplateConfig={MODERATION_DM_CONFIGS[activeTab]}
                resetKey={`${resetKey}_${activeTab}`}
                modeLabel={`Message Mode (${activeTab.replace(/_/g, " ")})`}
                placeholderText={PLACEHOLDERS[activeTab]}
                setIsEmpty={setIsEmpty}
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}