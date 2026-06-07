"use client";

import { DiscordChannel, WelcomeConfig } from "@/types";
import { JSX, useCallback, useMemo, useState, useTransition } from "react";
import { ToggleSwitch } from "@/components/Dashboard/ToggleSwitch";
import { SavePopup } from "@/components/Dashboard/SavePopup";
import GenericEmbedBuilder from "../Embed/GenericEmbedBuilder";
import { WELCOME_CONFIG } from "@/lib/embedTemplates";
import { Pad } from "../Pad";
import { ChannelSelector } from "@/components/Dashboard/ChannelSelector";
import { PlaceholderList } from "@/components/Embed/PlaceholderList";

interface WelcomeBodyProps {
    welcomeConfig: WelcomeConfig;
    channels: DiscordChannel[];
    onSave: (config: WelcomeConfig) => Promise<void>;
    serverName?: string;
    serverIconUrl?: string;
    profilePictureUrl?: string;
}

const safeParseEmbed = (embedValue: unknown) => {
    if (!embedValue) return {};
    if (typeof embedValue === "string") {
        try {
            return JSON.parse(embedValue);
        } catch {
            return {};
        }
    }
    if (typeof embedValue === "object") {
        return embedValue;
    }
    return {};
};

const isDeepEqual = (obj1: any, obj2: any): boolean => {
    if (obj1 === obj2) return true;

    // Treat null, undefined, and empty string as equivalent "empty" values
    const isEmpty = (val: any) => val === undefined || val === null || val === "";

    if (isEmpty(obj1) && isEmpty(obj2)) return true;

    if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 == null || obj2 == null) {
        return false;
    }

    const keys1 = Object.keys(obj1).filter((k) => !isEmpty(obj1[k]));
    const keys2 = Object.keys(obj2).filter((k) => !isEmpty(obj2[k]));

    // Special case: Default color 0 (black) is considered equivalent to an omitted/empty color
    const hasColor1 = keys1.includes("color");
    const hasColor2 = keys2.includes("color");

    if (hasColor1 !== hasColor2) {
        if (hasColor1 && obj1.color === 0) {
            keys1.splice(keys1.indexOf("color"), 1);
        } else if (hasColor2 && obj2.color === 0) {
            keys2.splice(keys2.indexOf("color"), 1);
        }
    }

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!isDeepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
};

export function WelcomeBody({
    welcomeConfig,
    channels,
    onSave
}: WelcomeBodyProps): JSX.Element {
    // Normalizes input values for safety
    const normalizedWelcomeConfig = useMemo((): WelcomeConfig => {
        return {
            public: {
                enabled: welcomeConfig.public?.enabled ?? false,
                channel_id: welcomeConfig.public?.channel_id || "",
                content: welcomeConfig.public?.content || "",
                embed: safeParseEmbed(welcomeConfig.public?.embed),
                format: welcomeConfig.public?.format || "embed",
            },
            private: {
                enabled: welcomeConfig.private?.enabled ?? false,
                content: welcomeConfig.private?.content || "",
                embed: safeParseEmbed(welcomeConfig.private?.embed),
                format: welcomeConfig.private?.format || "embed",
            }
        };
    }, [welcomeConfig]);

    const [config, setConfig] = useState<WelcomeConfig>(normalizedWelcomeConfig);
    const [activeTab, setActiveTab] = useState<"public" | "private">("public");
    const [isPending, startTransition] = useTransition();
    const [resetKey, setResetKey] = useState(0);

    const activeSettings = config[activeTab];
    const initialEmbedState = normalizedWelcomeConfig[activeTab].embed;

    // Stable handler for public embed updates
    const handleEmbedStatePublic = useCallback((embedState: any) => {
        setConfig((prev) => ({
            ...prev,
            public: {
                ...prev.public,
                embed: embedState
            }
        }));
    }, []);

    // Stable handler for private embed updates
    const handleEmbedStatePrivate = useCallback((embedState: any) => {
        setConfig((prev) => ({
            ...prev,
            private: {
                ...prev.private,
                embed: embedState
            }
        }));
    }, []);

    const isDirty = !isDeepEqual(config, normalizedWelcomeConfig);

    const handleSave = () => {
        startTransition(async () => {
            await onSave(config);
        });
    };

    const handleCancel = () => {
        setConfig(normalizedWelcomeConfig);
        setResetKey((prev) => prev + 1);
    };

    return (
        <div>
            {/* Tab Selector */}
            <div className="flex space-x-4 border-b border-neutral-800 mb-6">
                <button
                    type="button"
                    onClick={() => setActiveTab("public")}
                    className={`pb-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition select-none ${
                        activeTab === "public"
                            ? "border-neutral-200 text-white"
                            : "border-transparent text-neutral-500 hover:text-neutral-300"
                    }`}
                >
                    Public Message
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("private")}
                    className={`pb-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition select-none ${
                        activeTab === "private"
                            ? "border-neutral-200 text-white"
                            : "border-transparent text-neutral-500 hover:text-neutral-300"
                    }`}
                >
                    Private Message (DM)
                </button>
            </div>

            {/* Config Enable Toggle */}
            <ToggleSwitch
                enabled={activeSettings.enabled} disabled={isPending} onChange={(checked) =>
                setConfig((prev) => ({
                    ...prev,
                    [activeTab]: { ...prev[activeTab], enabled: checked }
                }))
            } text={
                activeTab === "public"
                    ? "Send Public Message when New User Joins"
                    : "Send Direct Message (DM) when New User Joins"
            }
            />
            <Pad/>

            {activeSettings.enabled && (
                <>
                    {/* Channel selection applies only to the public messages */}
                    {activeTab === "public" && (
                        <>
                            <ChannelSelector
                                channels={channels}
                                value={config.public.channel_id || ""}
                                disabled={isPending}
                                onChange={(value) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        public: { ...prev.public, channel_id: value }
                                    }))
                                }
                            />
                            <Pad/>
                        </>
                    )}

                    {/* Mode Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider block text-neutral-400">
                            Message Mode ({activeTab === "public" ? "Public" : "Private"})
                        </label>
                        <div className="flex space-x-2 bg-neutral-300/5 p-1 rounded border border-neutral-700 w-fit">
                            <button
                                type="button" disabled={isPending} onClick={() =>
                                setConfig((prev) => ({
                                    ...prev,
                                    [activeTab]: { ...prev[activeTab], format: "text" }
                                }))
                            } className={`px-3 py-1.5 rounded text-xs font-semibold transition select-none ${
                                activeSettings.format === "text"
                                    ? "bg-neutral-800 text-white"
                                    : "text-neutral-400 hover:text-white"
                            }`}
                            >
                                Plaintext Message
                            </button>
                            <button
                                type="button" disabled={isPending} onClick={() =>
                                setConfig((prev) => ({
                                    ...prev,
                                    [activeTab]: { ...prev[activeTab], format: "embed" }
                                }))
                            } className={`px-3 py-1.5 rounded text-xs font-semibold transition select-none ${
                                activeSettings.format === "embed"
                                    ? "bg-neutral-800 text-white"
                                    : "text-neutral-400 hover:text-white"
                            }`}
                            >
                                Rich Embed
                            </button>
                        </div>
                    </div>
                    <Pad/>

                    {/* Content Editors */}
                    {activeSettings.format === "text" ? (
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider block text-neutral-400">
                                Message Content
                            </label>
                            <PlaceholderList config={WELCOME_CONFIG}/>
                            <textarea
                                value={activeSettings.content || ""}
                                disabled={isPending}
                                onChange={(e) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        [activeTab]: { ...prev[activeTab], content: e.target.value }
                                    }))
                                }
                                rows={4}
                                placeholder={
                                    activeTab === "public"
                                        ? "Welcome to the server, {user.mention}!"
                                        : "Thanks for joining our server, {user.mention}! Here are some links to get started..."
                                }
                                className="w-full p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500 resize-none font-mono text-white placeholder-neutral-600"
                            />
                            <p className="text-xs text-neutral-500">
                                Supports dynamic placeholders and mentions. </p>
                        </div>
                    ) : (
                        <GenericEmbedBuilder
                            key={`${resetKey}_${activeTab}`} setEmbedState={
                            activeTab === "public"
                                ? handleEmbedStatePublic
                                : handleEmbedStatePrivate
                        } config={WELCOME_CONFIG} initialEmbedState={initialEmbedState}
                        />
                    )}
                </>
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}