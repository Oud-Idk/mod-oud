"use client";

import React, { useEffect, useState } from "react";
import { saveTempVoiceHubAction, setupTempVoiceAction } from "@/actions/tempVoice";
import { ConfigListLayout } from "@/components/Dashboards/General/ConfigListLayout";
import { HubForm } from "@/components/Dashboards/TempVoice/HubForm";
import { TempVoiceHub } from "@/types/db";

interface TempVoiceBodyProps {
    guildId: string;
    initialHubs: TempVoiceHub[];
    categoryMap: Record<string, string>;
    voiceChannelMap: Record<string, string>;
    textChannelMap: Record<string, string>;
}

export function TempVoiceBody({
    guildId,
    initialHubs,
    categoryMap: initialCategoryMap,
    voiceChannelMap: initialVoiceChannelMap,
    textChannelMap: initialTextChannelMap,
}: TempVoiceBodyProps) {
    const [hubs, setHubs] = useState<TempVoiceHub[]>(initialHubs);
    const [activeHubId, setActiveHubId] = useState<string | "new" | null>(null);
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [setupError, setSetupError] = useState<string | null>(null);

    const [categories, setCategories] = useState(initialCategoryMap);
    const [voiceChannels, setVoiceChannels] = useState(initialVoiceChannelMap);
    const [textChannels, setTextChannels] = useState(initialTextChannelMap);

    useEffect(() => {
        setHubs(initialHubs);
    }, [initialHubs]);
    useEffect(() => {
        setCategories(initialCategoryMap);
    }, [initialCategoryMap]);
    useEffect(() => {
        setVoiceChannels(initialVoiceChannelMap);
    }, [initialVoiceChannelMap]);
    useEffect(() => {
        setTextChannels(initialTextChannelMap);
    }, [initialTextChannelMap]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setActiveHubId(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    // Active configuration details
    const activeHub = hubs.find(h => h.id === activeHubId) || (activeHubId === "new" ? {
        id: "",
        guild_id: guildId,
        name: "New Hub",
        hub_channel_id: "",
        category_id: "",
        user_limit: null
    } as Partial<TempVoiceHub> : null);

    // Creates a new configuration draft in local state on the right hand side
    function handleCreateNewManual() {
        setActiveHubId("new");
    }

    // Direct automated configuration via Discord bot
    async function handleSetupTempVoice() {
        setIsSettingUp(true);
        setSetupError(null);

        const defaultCategoryName = "Temporary Channels";
        const defaultHubName = "🔊 Join to Create";

        const res = await setupTempVoiceAction(guildId, {
            categoryName: defaultCategoryName,
            hubChannelName: defaultHubName,
        });

        setIsSettingUp(false);

        if (!res.success) {
            setSetupError(res.error || "Something went wrong setup.");
            return;
        }

        if (res.categoryId && res.hubChannelId) {
            // Update local channels & categories map lists
            setCategories(prev => ({ ...prev, [res.categoryId!]: defaultCategoryName }));
            setVoiceChannels(prev => ({ ...prev, [res.hubChannelId!]: defaultHubName }));
            setTextChannels(prev => ({ ...prev, [res.interfaceChannelId!]: "interface" }));

            // Save row directly to Database table and select it
            const saveRes = await saveTempVoiceHubAction(guildId, {
                name: "Auto Setup Hub",
                hub_channel_id: res.hubChannelId,
                category_id: res.categoryId,
                user_limit: 0,
                interface_channel_id: res.interfaceChannelId,
                default_channel_name: "{user.display_name}'s Lounge"
            });

            if (saveRes.success && saveRes.hub) {
                setHubs(prev => [...prev, saveRes.hub]);
                setActiveHubId(saveRes.hub.id);
            }
        }
    }

    return (
        <ConfigListLayout<TempVoiceHub> title="Temporary Voice Hubs"
            createButtonText="+ Add Hub"
            onCreateClick={handleCreateNewManual}
            items={hubs}
            renderItem={(hub) => (
                <button
                    key={hub.id}
                    onClick={() => setActiveHubId(hub.id)}
                    className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${
                        activeHubId === hub.id
                            ? "bg-neutral-400/15 hover:bg-neutral-400/20 font-medium"
                            : "hover:bg-neutral-300/15"
                    }`}
                >
                    <div className="font-semibold">{hub.name}</div>
                    <div className="text-neutral-400 mt-0.5">
                        {voiceChannels[hub.hub_channel_id] ? `#${voiceChannels[hub.hub_channel_id]}` : "Unconfigured"}
                    </div>
                </button>
            )}
            emptyMessage="No voice hubs configured yet."
            hasActiveConfig={activeHubId !== null}
            noActivePlaceholder={
                <div className="flex flex-col items-center justify-center p-6 text-center">
                    <p className="font-semibold mb-2 text-neutral-200 text-lg">Manage
                        Temporary Voice Channels</p>

                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={handleSetupTempVoice}
                            disabled={isSettingUp}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition cursor-pointer"
                        >
                            {isSettingUp ? "Working our magic..." : "Set it up for me"}
                        </button>
                        <button
                            type="button"
                            onClick={handleCreateNewManual}
                            className="px-4 py-2 border border-neutral-600 hover:bg-neutral-300/10 text-neutral-200 rounded-md text-sm font-semibold transition cursor-pointer"
                        >
                            Configure Manually
                        </button>
                    </div>

                    {setupError && (
                        <p className="text-red-500 text-sm mt-4">Error: {setupError}</p>
                    )}
                </div>
            }
        >
            {activeHub && (
                <HubForm
                    key={activeHub.id || "new"}
                    guildId={guildId}
                    initialHub={activeHub as TempVoiceHub}
                    voiceChannels={voiceChannels}
                    categories={categories}
                    onSaveSuccess={(savedHub) => {
                        if (activeHubId === "new") {
                            setHubs(prev => [...prev, savedHub]);
                        } else {
                            setHubs(prev => prev.map(h => h.id === savedHub.id ? savedHub : h));
                        }
                        setActiveHubId(savedHub.id);
                    }}
                    onDeleteSuccess={() => {
                        setHubs(prev => prev.filter(h => h.id !== activeHubId));
                        setActiveHubId(null);
                    }}
                    textChannels={textChannels}
                />
            )}
        </ConfigListLayout>
    );
}