"use client";

import React, { useState, JSX } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { WELCOME_CONFIG } from "../builderConfigs";

import { AutoAssignRole } from "./AutoAssignRole";
import { VerificationTab } from "./VerificationTab";
import type { WelcomeConfig } from "../types";
import { saveWelcomeConfigSchema } from "../types";
import type { DiscordChannel } from "@/features/_shared/channels.types";

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
    channelMap,
}: WelcomeBodyProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<TabValue>("PUBLIC");
    const [targetChannelIsEmpty, setTargetChannelIsEmpty] = useState(false);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        resetKey,
        handleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: welcomeConfig,
        onSave,
        schema: saveWelcomeConfigSchema,
    });

    const isSystemConfigured =
        config.verification.verificationChannelId !== null &&
        config.verification.verificationChannelId !== "" &&
        config.verification.verificationRoleId !== null &&
        config.verification.verificationRoleId !== "";

    return (
        <div className="space-y-4">
            <Tabs tabs={WELCOME_TABS} activeTab={activeTab} onChange={setActiveTab} />

            <div>
                {activeTab === "PUBLIC" && (
                    <MessageConfigEditor
                        config={{
                            enabled: config.public.enabled,
                            channel_id: config.public.channel_id ?? "",
                            content: config.public.message.content,
                            embed: config.public.message.embed,
                            format: config.public.message.format,
                        }}
                        onChange={(updated) => {
                            setConfig((prev) => ({
                                ...prev,
                                public: {
                                    ...prev.public,
                                    enabled: updated.enabled ?? false,
                                    channel_id:
                                        updated.channel_id !== undefined && updated.channel_id !== ""
                                            ? updated.channel_id
                                            : null,
                                    message: {
                                        format: updated.format,
                                        content: updated.content ?? "",
                                        embed: updated.embed ?? {},
                                    },
                                },
                            }));
                        }}
                        onEmbedChange={(embed) => {
                            setConfig((prev) => ({
                                ...prev,
                                public: {
                                    ...prev.public,
                                    message: { ...prev.public.message, embed },
                                },
                            }));
                        }}
                        channels={channels}
                        disabled={isPending}
                        toggleLabel="Send Public Message when New User Joins"
                        embedTemplateConfig={WELCOME_CONFIG}
                        resetKey={`${String(resetKey)}_public`}
                        modeLabel="Message Mode"
                        placeholderText="Welcome to the server, {user.mention}!"
                        setTargetChannelIsEmpty={setTargetChannelIsEmpty}
                        targetChannelIsEmpty={targetChannelIsEmpty}
                    />
                )}

                {activeTab === "PRIVATE" && (
                    <MessageConfigEditor
                        config={{
                            enabled: config.private.enabled,
                            channel_id: "",
                            content: config.private.message.content,
                            embed: config.private.message.embed,
                            format: config.private.message.format,
                        }}
                        onChange={(updated) => {
                            setConfig((prev) => ({
                                ...prev,
                                private: {
                                    ...prev.private,
                                    enabled: updated.enabled ?? false,
                                    message: {
                                        format: updated.format,
                                        content: updated.content ?? "",
                                        embed: updated.embed ?? {},
                                    },
                                },
                            }));
                        }}
                        onEmbedChange={(embed) => {
                            setConfig((prev) => ({
                                ...prev,
                                private: {
                                    ...prev.private,
                                    message: { ...prev.private.message, embed },
                                },
                            }));
                        }}
                        disabled={isPending}
                        toggleLabel="Send Direct Message (DM) when New User Joins"
                        embedTemplateConfig={WELCOME_CONFIG}
                        resetKey={`${String(resetKey)}_private`}
                        modeLabel="Message Mode (Private)"
                        placeholderText="Thanks for joining our server, {user.mention}! Here are some links to get started..."
                        setTargetChannelIsEmpty={setTargetChannelIsEmpty}
                        targetChannelIsEmpty={targetChannelIsEmpty}
                    />
                )}

                {activeTab === "ROLES" && (
                    <AutoAssignRole roles={roles} config={config} isPending={isPending} setConfig={setConfig} />
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
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}