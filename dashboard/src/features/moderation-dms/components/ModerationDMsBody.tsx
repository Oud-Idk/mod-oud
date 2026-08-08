"use client";

import { JSX, useMemo, useState } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { ModerationDMsConfig, moderationDMsConfigSchema } from "@/features/moderation-dms/types";
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
    WARN_CONFIG,
} from "@/features/moderation-dms/builderConfigs";
import { BuilderConfig } from "@/features/_shared/builderConfig";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { toast } from "sonner";

interface ModerationDMsBodyProps {
    moderationDMsConfig: ModerationDMsConfig;
    onSave: (config: ModerationDMsConfig) => Promise<void>;
}

type TabValue =
    | "WARN"
    | "PARDON_WARN"
    | "UNPARDON_WARN"
    | "UNPARDON_DELETE_WARN"
    | "MUTE"
    | "UNMUTE"
    | "KICK"
    | "BAN"
    | "SOFTBAN"
    | "HONEYPOT";

const MODERATION_DM_TABS: TabItem<TabValue>[] = [
    { value: "WARN", label: "Warn" },
    { value: "PARDON_WARN", label: "Pardon Warn" },
    { value: "UNPARDON_WARN", label: "Unpardon Warn" },
    { value: "UNPARDON_DELETE_WARN", label: "Unpardon + Delete" },
    { value: "MUTE", label: "Mute" },
    { value: "UNMUTE", label: "Unmute" },
    { value: "KICK", label: "Kick" },
    { value: "BAN", label: "Ban" },
    { value: "SOFTBAN", label: "Softban" },
    { value: "HONEYPOT", label: "Honeypot" },
];

const PLACEHOLDERS: Record<TabValue, string> = {
    WARN: "You have been warned in {server.name} for: {reason}",
    PARDON_WARN: "Your warning in {server.name} has been pardoned.",
    UNPARDON_WARN: "Your warning in {server.name} has been reinstated.",
    UNPARDON_DELETE_WARN: "Your warning in {server.name} has been deleted.",
    MUTE: "You have been muted in {server.name} for {duration}. Reason: {reason}",
    UNMUTE: "You have been unmuted in {server.name}.",
    KICK: "You have been kicked from {server.name}. Reason: {reason}",
    BAN: "You have been banned from {server.name}. Reason: {reason} | Appeal: {appeal_link}",
    SOFTBAN: "You have been softbanned from {server.name}. Reason: {reason}",
    HONEYPOT: "You have been banned from the {server.name} due to sending a message in a honeypot channel",
};

const MODERATION_DM_CONFIGS: Record<TabValue, BuilderConfig> = {
    WARN: WARN_CONFIG,
    PARDON_WARN: PARDON_WARN_CONFIG,
    UNPARDON_WARN: UNPARDON_WARN_CONFIG,
    UNPARDON_DELETE_WARN: UNPARDON_DELETE_WARN_CONFIG,
    MUTE: MUTE_CONFIG,
    UNMUTE: UNMUTE_CONFIG,
    KICK: KICK_CONFIG,
    BAN: BAN_CONFIG,
    SOFTBAN: SOFTBAN_CONFIG,
    HONEYPOT: HONEYPOT_CONFIG,
};

const TAB_TO_CONFIG_KEY = {
    WARN: "warn",
    PARDON_WARN: "pardonWarn",
    UNPARDON_WARN: "unpardonWarn",
    UNPARDON_DELETE_WARN: "unpardonDeleteWarn",
    MUTE: "mute",
    UNMUTE: "unmute",
    KICK: "kick",
    BAN: "ban",
    SOFTBAN: "softban",
    HONEYPOT: "honeypot",
} satisfies Record<TabValue, keyof ModerationDMsConfig>;

export function ModerationDMsBody({
    moderationDMsConfig,
    onSave,
}: ModerationDMsBodyProps): JSX.Element {
    const normalizedConfig = useMemo(() => moderationDMsConfig, [moderationDMsConfig]);
    const [activeTab, setActiveTab] = useState<TabValue>("WARN");
    const [, setIsEmpty] = useState(false);

    const activeKey = TAB_TO_CONFIG_KEY[activeTab];

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        resetKey,
        handleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: normalizedConfig,
        onSave,
    });

    const onValidatedSave = (): void => {
        const result = moderationDMsConfigSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0]?.message || "Invalid configuration");
            return;
        }
        handleSave();
    };

    return (
        <div>
            <Tabs tabs={MODERATION_DM_TABS} activeTab={activeTab} onChange={setActiveTab} />

            <MessageConfigEditor
                config={config[activeKey].message}
                onChange={(updated) =>
                    setConfig((prev) => ({
                        ...prev,
                        [activeKey]: {
                            enabled: updated.enabled ?? prev[activeKey].enabled,
                            content: updated.content ?? "",
                            embed: updated.embed ?? {},
                            format: updated.format ?? "TEXT",
                        },
                    }))
                }
                onEmbedChange={(embed) =>
                    setConfig((prev) => ({
                        ...prev,
                        [activeKey]: { ...prev[activeKey], embed },
                    }))
                }
                disabled={isPending}
                toggleLabel={`Apply Custom Direct Messages for ${activeTab.charAt(0).toUpperCase() + activeTab.replace(/_/g, " ").slice(1).toLowerCase()}s`}
                embedTemplateConfig={MODERATION_DM_CONFIGS[activeTab]}
                resetKey={`${resetKey}_${activeTab}`}
                modeLabel={`Message Mode (${activeTab.replace(/_/g, " ")})`}
                placeholderText={PLACEHOLDERS[activeTab]}
                setIsEmpty={setIsEmpty}
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={onValidatedSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}