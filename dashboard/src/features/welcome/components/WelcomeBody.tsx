"use client";

import { useState, JSX } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { WelcomeImageStyleEditor } from "./WelcomeImageStyleEditor";
import { WELCOME_CONFIG } from "../builderConfigs";

import { AutoAssignRole } from "./AutoAssignRole";
import { saveWelcomeConfigSchema, type WelcomeConfig, type WelcomeImageStyle } from "../types";
import type { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import type { DiscordEmbed } from "@/features/_shared/embed";
import type { DiscordChannel } from "@/features/_shared/channels.types";

export interface DiscordRole {
    id: string;
    name: string;
    color: number;
    managed: boolean;
}

interface WelcomeBodyProps {
    welcomeConfig: WelcomeConfig;
    channels: DiscordChannel[];
    roles: DiscordRole[];
    onSave: (config: WelcomeConfig) => Promise<void>;
}

type TabValue = "PUBLIC" | "PRIVATE" | "ROLES";

const WELCOME_TABS: TabItem<TabValue>[] = [
    { value: "PUBLIC", label: "Public Message" },
    { value: "PRIVATE", label: "Private Message (DM)" },
    { value: "ROLES", label: "Welcome Roles" },
];

interface WelcomeImageFieldsProps {
    sendImage: boolean;
    imageStyle: WelcomeImageStyle;
    disabled: boolean;
    onSendImageChange: (sendImage: boolean) => void;
    onImageStyleChange: (imageStyle: WelcomeImageStyle) => void;
}

// The public and private editors differ only in their state path (plus the
// public channel mapping); both updaters funnel through these helpers.
function applyMessageUpdate(
    prev: WelcomeConfig,
    target: "public" | "private",
    updated: GenericMessageConfig,
): WelcomeConfig {
    const message = {
        format: updated.format,
        content: updated.content ?? "",
        embed: updated.embed ?? {},
    };
    if (target === "public") {
        return {
            ...prev,
            public: {
                ...prev.public,
                enabled: updated.enabled ?? false,
                channelId:
                    updated.channel_id !== undefined && updated.channel_id !== ""
                        ? updated.channel_id
                        : null,
                message,
            },
        };
    }
    return {
        ...prev,
        private: { ...prev.private, enabled: updated.enabled ?? false, message },
    };
}

function applyEmbedUpdate(
    prev: WelcomeConfig,
    target: "public" | "private",
    embed: DiscordEmbed,
): WelcomeConfig {
    if (target === "public") {
        return { ...prev, public: { ...prev.public, message: { ...prev.public.message, embed } } };
    }
    return { ...prev, private: { ...prev.private, message: { ...prev.private.message, embed } } };
}

// Shared by the public and private message editors; only the state paths differ.
function WelcomeImageFields({
    sendImage,
    imageStyle,
    disabled,
    onSendImageChange,
    onImageStyleChange,
}: WelcomeImageFieldsProps): JSX.Element {
    return (
        <div className="space-y-4">
            <ToggleSwitch
                checked={sendImage}
                disabled={disabled}
                onChange={onSendImageChange}
                className="mt-2"
                text="Send Welcome Image"
            />
            {sendImage && (
                <WelcomeImageStyleEditor
                    templatePath="/welcome-template.svg"
                    style={imageStyle}
                    disabled={disabled}
                    onChange={onImageStyleChange}
                />
            )}
        </div>
    );
}

export function WelcomeBody({
    welcomeConfig,
    channels,
    roles,
    onSave,
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

    return (
        <div className="space-y-4">
            <Tabs tabs={WELCOME_TABS} activeTab={activeTab} onChange={setActiveTab} />

            <div>
                {activeTab === "PUBLIC" && (
                    <MessageConfigEditor
                        config={{
                            enabled: config.public.enabled,
                            channel_id: config.public.channelId ?? "",
                            content: config.public.message.content,
                            embed: config.public.message.embed,
                            format: config.public.message.format,
                        }}
                        onChange={(updated) => {
                            setConfig((prev) => applyMessageUpdate(prev, "public", updated));
                        }}
                        onEmbedChange={(embed) => {
                            setConfig((prev) => applyEmbedUpdate(prev, "public", embed));
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
                        customFields={
                            <WelcomeImageFields
                                sendImage={config.public.sendImage}
                                imageStyle={config.public.imageStyle}
                                disabled={isPending}
                                onSendImageChange={(checked) => {
                                    setConfig((prev) => ({
                                        ...prev,
                                        public: { ...prev.public, sendImage: checked },
                                    }));
                                }}
                                onImageStyleChange={(imageStyle) => {
                                    setConfig((prev) => ({
                                        ...prev,
                                        public: { ...prev.public, imageStyle },
                                    }));
                                }}
                            />
                        }
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
                            setConfig((prev) => applyMessageUpdate(prev, "private", updated));
                        }}
                        onEmbedChange={(embed) => {
                            setConfig((prev) => applyEmbedUpdate(prev, "private", embed));
                        }}
                        disabled={isPending}
                        toggleLabel="Send Direct Message (DM) when New User Joins"
                        embedTemplateConfig={WELCOME_CONFIG}
                        resetKey={`${String(resetKey)}_private`}
                        modeLabel="Message Mode (Private)"
                        placeholderText="Thanks for joining our server, {user.mention}! Here are some links to get started..."
                        setTargetChannelIsEmpty={setTargetChannelIsEmpty}
                        targetChannelIsEmpty={targetChannelIsEmpty}
                        customFields={
                            <WelcomeImageFields
                                sendImage={config.private.sendImage}
                                imageStyle={config.private.imageStyle}
                                disabled={isPending}
                                onSendImageChange={(checked) => {
                                    setConfig((prev) => ({
                                        ...prev,
                                        private: { ...prev.private, sendImage: checked },
                                    }));
                                }}
                                onImageStyleChange={(imageStyle) => {
                                    setConfig((prev) => ({
                                        ...prev,
                                        private: { ...prev.private, imageStyle },
                                    }));
                                }}
                            />
                        }
                    />
                )}

                {activeTab === "ROLES" && (
                    <AutoAssignRole roles={roles} config={config} isPending={isPending} setConfig={setConfig} />
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