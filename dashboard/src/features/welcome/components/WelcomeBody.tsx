"use client";

import React, { ReactNode, useMemo, useState } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { AutoAssignRole } from "@/features/welcome/components/AutoAssignRole";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { VerificationTab } from "@/features/welcome/components/VerificationTab";
import { WelcomeConfig } from "@/features/welcome/types";
import { WELCOME_CONFIG } from "@/features/welcome/builderConfigs";

import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordChannel } from "@/features/_shared/channels.types";

export interface DiscordRole {
    id: string;
    name: string;
    color: number;
    managed: boolean;
}

interface WelcomeBodyProps {
    guildId: string;
    welcomeConfig: WelcomeConfig;
    channels: DiscordChannel[];
    roles: DiscordRole[];
    onSave: (config: WelcomeConfig) => Promise<void>;
    profilePictureUrl?: string;
    channelMap: Record<string, string>;
}

type TabValue = "PUBLIC" | "PRIVATE" | "ROLES" | "VERIFICATION";

const WELCOME_TABS: TabItem<TabValue>[] = [
    { value: "PUBLIC", label: "Public Message" },
    { value: "PRIVATE", label: "Private Message (DM)" },
    { value: "ROLES", label: "Welcome Roles" },
    { value: "VERIFICATION", label: "Verification" },
];

export function WelcomeBody({
    guildId,
    welcomeConfig,
    channels,
    roles,
    onSave,
    channelMap
}: WelcomeBodyProps): ReactNode {
    const normalizedWelcomeConfig = useMemo(() => welcomeConfig, [welcomeConfig]);
    const [activeTab, setActiveTab] = useState<TabValue>("PUBLIC");

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        resetKey,
        targetChannelIsEmpty,
        setIsEmpty,
        setTargetChannelIsEmpty,
        handleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: normalizedWelcomeConfig,
        onSave,
    });

    const isSystemConfigured = !!(
        config.verification?.verificationChannelId &&
        config.verification?.verificationRoleId
    );

    return (
        <div>
            <Tabs tabs={WELCOME_TABS} activeTab={activeTab} onChange={setActiveTab}/>

            <div>
                {activeTab === "PUBLIC" && (
                    <MessageConfigEditor
                        config={config.public}
                        onChange={(updated) =>
                            setConfig((prev) => ({
                                ...prev,
                                public: {
                                    enabled: updated.enabled ?? false,
                                    channel_id: updated.channel_id ?? "",
                                    content: updated.content ?? "",
                                    embed: updated.embed ?? {},
                                    format: updated.format,
                                }
                            }))
                        }
                        setIsEmpty={setIsEmpty}
                        onEmbedChange={(embed) =>
                            setConfig((prev) => ({
                                ...prev,
                                public: { ...prev.public, embed }
                            }))
                        }
                        channels={channels}
                        disabled={isPending}
                        toggleLabel="Send Public Message when New User Joins"
                        embedTemplateConfig={WELCOME_CONFIG}
                        resetKey={`${resetKey}_public`}
                        modeLabel="Message Mode"
                        placeholderText="Welcome to the server, {user.mention}!"
                        setTargetChannelIsEmpty={setTargetChannelIsEmpty}
                        targetChannelIsEmpty={targetChannelIsEmpty}
                    />
                )}

                {activeTab === "PRIVATE" && (
                    <MessageConfigEditor
                        config={config.private}
                        onChange={(updated) =>
                            setConfig((prev) => ({
                                ...prev,
                                private: {
                                    enabled: updated.enabled ?? false,
                                    content: updated.content ?? "",
                                    embed: updated.embed ?? {},
                                    format: updated.format,
                                }
                            }))
                        }
                        onEmbedChange={(embed) =>
                            setConfig((prev) => ({
                                ...prev,
                                private: { ...prev.private, embed }
                            }))
                        }
                        setIsEmpty={setIsEmpty}
                        disabled={isPending}
                        toggleLabel="Send Direct Message (DM) when New User Joins"
                        embedTemplateConfig={WELCOME_CONFIG}
                        resetKey={`${resetKey}_private`}
                        modeLabel="Message Mode (Private)"
                        placeholderText="Thanks for joining our server, {user.mention}! Here are some links to get started..."
                        setTargetChannelIsEmpty={setTargetChannelIsEmpty}
                        targetChannelIsEmpty={targetChannelIsEmpty}
                    />
                )}

                {activeTab === "ROLES" && (
                    <AutoAssignRole roles={roles} config={config} isPending={isPending} setConfig={setConfig}/>
                )}

                {activeTab === "VERIFICATION" && (
                    <VerificationTab
                        config={config}
                        setConfig={setConfig}
                        isSystemConfigured={isSystemConfigured}
                        guildId={guildId}
                        isDirty={isDirty}
                        roles={roles}
                        channelMap={channelMap}
                    />
                )}
            </div>

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}