"use client";

import { DiscordChannel, WelcomeConfig } from "@/types";
import { JSX, useCallback, useMemo, useState, useTransition } from "react";
import { EnableSwitch } from "@/components/Dashboard/EnableSwitch";
import { SavePopup } from "@/components/Dashboard/SavePopup";
import GenericEmbedBuilder from "../Embed/GenericEmbedBuilder";
import { WELCOME_CONFIG } from "@/lib/embedTemplates";
import { Pad } from "../Pad";
import { ChannelSelector } from "@/components/Dashboard/ChannelSelector";

interface WelcomeBodyProps {
    welcomeConfig: WelcomeConfig;
    channels: DiscordChannel[];
    onSave: (config: WelcomeConfig) => Promise<void>;
    serverName?: string;
    serverIconUrl?: string;
    profilePictureUrl?: string;
}

// Helper to safely parse embed configs which might be strings or objects
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

// Deep equal comparison to safely check if the configuration has changed
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
    // Normalize initial state to ensure 'embed' is an object and consistent
    const normalizedWelcomeConfig = useMemo(() => {
        return {
            ...welcomeConfig,
            format: welcomeConfig.format || "embed", // Preserves format state
            content: welcomeConfig.content || "",
            embed: safeParseEmbed(welcomeConfig.embed),
        };
    }, [welcomeConfig]);

    const [config, setConfig] = useState(normalizedWelcomeConfig);
    const [isPending, startTransition] = useTransition();
    const [resetKey, setResetKey] = useState(0);

    // Using useCallback prevents GenericEmbedBuilder from unnecessarily re-triggering its internal lifecycle
    const handleEmbedState = useCallback((embedState: any) => {
        setConfig((prev) => ({ ...prev, embed: embedState }));
    }, []);

    // Directly derive active layout mode from configuration properties
    const mode = config.format || "embed";

    // Standard dirty checking handles raw objects without nuking any underlying configurations
    const isDirty = !isDeepEqual(config, normalizedWelcomeConfig);

    const handleSave = () => {
        startTransition(async () => {
            await onSave(config);
        });
    };

    const handleCancel = () => {
        setConfig(normalizedWelcomeConfig); // Reset config to database state
        setResetKey((prev) => prev + 1);    // Force remount of the Embed builder
    };

    return (
        <div>
            <EnableSwitch
                enabled={config.enabled} disabled={isPending} onChange={(checked) =>
                setConfig((prev) => ({ ...prev, enabled: checked }))
            }
            />
            <Pad/>

            {config.enabled && (
                <>
                    <ChannelSelector
                        channels={channels}
                        value={config.channel_id || ""}
                        disabled={isPending}
                        onChange={(value) => setConfig((prev) => ({ ...prev, channel_id: value }))}
                    />
                    <Pad/>

                    {/* ── Mode Switcher (Plaintext vs Embed) ── */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider block text-neutral-400">
                            Welcome Message Mode
                        </label>
                        <div className="flex space-x-2 bg-neutral-300/5 p-1 rounded border border-neutral-700 w-fit">
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setConfig((prev) => ({ ...prev, format: "text" }))}
                                className={`px-3 py-1.5 rounded text-xs font-semibold transition select-none ${
                                    mode === "text"
                                        ? "bg-neutral-800 text-white"
                                        : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                Plaintext Message
                            </button>
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setConfig((prev) => ({ ...prev, format: "embed" }))}
                                className={`px-3 py-1.5 rounded text-xs font-semibold transition select-none ${
                                    mode === "embed"
                                        ? "bg-neutral-800 text-white"
                                        : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                Rich Embed
                            </button>
                        </div>
                    </div>
                    <Pad/>

                    {/* ── Mode Contents ── */}
                    {mode === "text" ? (
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider block text-neutral-400">
                                Message Content (Plain Text / Pings)
                            </label>
                            <textarea
                                value={config.content || ""}
                                disabled={isPending}
                                onChange={(e) => setConfig((prev) => ({ ...prev, content: e.target.value }))}
                                rows={4}
                                placeholder="Welcome to the server, {user.mention}! We are glad to have you here."
                                className="w-full p-2 bg-neutral-300/5 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500 resize-none font-mono text-white placeholder-neutral-600"
                            />
                            <p className="text-xs text-neutral-500">
                                A standard text message sent as a direct chat. Supports all dynamic placeholders and
                                user mentions. </p>
                        </div>
                    ) : (
                        <GenericEmbedBuilder
                            key={resetKey}
                            setEmbedState={handleEmbedState}
                            config={WELCOME_CONFIG}
                            initialEmbedState={normalizedWelcomeConfig.embed}
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