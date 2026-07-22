"use client";

import { DiscordChannel } from "@/types";
import React, { JSX, useMemo, useState } from "react";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { DEFAULT_CONFIG } from "@/utils/embedTemplates";
import { TabItem, Tabs } from "@/components/Layout/Tabs";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { AutoAssignRole } from "@/components/Dashboards/Welcome/AutoAssignRole";
import { WelcomeConfig } from "@/types/db/config/welcome";
import { useConfigForm } from "@/hooks/useConfigForm";
import { VerificationTab } from "@/components/Dashboards/Welcome/VerificationTab";

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
}: WelcomeBodyProps): JSX.Element {
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

            <div className="mt-4">
                {activeTab === "PUBLIC" && (
                    <MessageConfigEditor
                        config={config.public}
                        onChange={(updated) =>
                            setConfig((prev) => ({
                                ...prev,
                                public: {
                                    enabled: updated.enabled ?? false,
                                    channel_id: updated.channel_id || "",
                                    content: updated.content,
                                    embed: updated.embed,
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
                        embedTemplateConfig={DEFAULT_CONFIG}
                        resetKey={`${resetKey}_public`}
                        modeLabel="Message Mode (Public)"
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
                                    ...updated,
                                    enabled: updated.enabled ?? false
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
                        embedTemplateConfig={DEFAULT_CONFIG}
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