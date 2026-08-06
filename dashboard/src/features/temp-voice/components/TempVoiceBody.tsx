"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { saveTempVoiceHubAction, setupTempVoiceAction } from "@/features/temp-voice/actions";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { HubForm } from "@/features/temp-voice/components/HubForm";
import { TempVoiceHub } from "@/features/temp-voice/types";
import { Button } from "@/components/ui/Button";

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
}: TempVoiceBodyProps): ReactNode {
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
        const handleKeyDown = (event: KeyboardEvent): void => {
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
        interface_channel_id: "",
        user_limit: null,
        default_channel_name: "{user.display_name}'s Lounge"
    } : null);

    // Creates a new configuration draft in local state on the right hand side
    function handleCreateNewManual(): void {
        setActiveHubId("new");
    }

    // Direct automated configuration via Discord bot
    async function handleSetupTempVoice(): Promise<void> {
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

        const categoryId = res.categoryId;
        const hubChannelId = res.hubChannelId;
        const interfaceChannelId = res.interfaceChannelId;

        if (categoryId && hubChannelId && interfaceChannelId) {
            // Update local channels & categories map lists
            setCategories(prev => ({ ...prev, [categoryId]: defaultCategoryName }));
            setVoiceChannels(prev => ({ ...prev, [hubChannelId]: defaultHubName }));
            setTextChannels(prev => ({ ...prev, [interfaceChannelId]: "interface" }));

            // Save row directly to Database table and select it
            try {
                const hub = await saveTempVoiceHubAction(guildId, {
                    id: null,
                    name: "Auto Setup Hub",
                    hub_channel_id: hubChannelId,
                    category_id: categoryId,
                    user_limit: 0,
                    interface_channel_id: interfaceChannelId,
                    guild_id: guildId,
                    default_channel_name: "{user.display_name}'s Lounge"
                });

                setHubs(prev => [...prev, hub]);
                setActiveHubId(hub.id);
            } catch (error) {
                console.error(error);
            }
        }
    }

    return (
        <ConfigListLayout<TempVoiceHub> title=" Temporary Voice Hubs"
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
                <div className="max-w-md mx-auto space-y-4 flex items-center flex-col">
                    <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-foreground">
                            Manage Temporary Voice Channels
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Create self-managing temporary voice channels that automatically clean up when empty. Choose automated wizard setup or configure your rules manually.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            onClick={handleSetupTempVoice}
                            disabled={isSettingUp}
                        >
                            {isSettingUp ? "Working our magic..." : "Set it up for me"}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleCreateNewManual}
                            disabled={isSettingUp}
                        >
                            Configure Manually
                        </Button>
                    </div>

                    {setupError && (
                        <p className="text-sm text-danger">
                            Error: {setupError}
                        </p>
                    )}
                </div>
            }
        >
            {activeHub && (
                <HubForm
                    key={activeHub.id || "new"}
                    guildId={guildId}
                    initialHub={activeHub}
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