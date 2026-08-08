"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { Button } from "@/components/ui/Button";
import { saveTempVoiceHubAction, setupTempVoiceAction } from "../actions";
import { HubForm } from "./HubForm";
import type { TempVoiceHub } from "../types";
import { toast } from "sonner";

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

    const [categories, setCategories] = useState(initialCategoryMap);
    const [voiceChannels, setVoiceChannels] = useState(initialVoiceChannelMap);
    const [textChannels, setTextChannels] = useState(initialTextChannelMap);

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

    const activeHub = hubs.find((h) => h.id === activeHubId) || (activeHubId === "new" ? {
        id: "",
        guild_id: guildId,
        name: "New Hub",
        hub_channel_id: null,
        category_id: null,
        interface_channel_id: null,
        user_limit: null,
        default_channel_name: "{user.display_name}'s Lounge",
    } : null);

    function handleCreateNewManual(): void {
        setActiveHubId("new");
    }

    async function handleSetupTempVoice(): Promise<void> {
        setIsSettingUp(true);

        const defaultCategoryName = "Temporary Channels";
        const defaultHubName = "🔊 Join to Create";

        try {
            const { categoryId, hubChannelId, interfaceChannelId } = await setupTempVoiceAction(guildId, {
                categoryName: defaultCategoryName,
                hubChannelName: defaultHubName,
            });

            // Validate we got everything back
            if (!categoryId || !hubChannelId || !interfaceChannelId) {
                throw new Error("Channel setup completed, but expected IDs were missing.");
            }

            // Update UI channel lists
            setCategories((prev) => ({ ...prev, [categoryId]: defaultCategoryName }));
            setVoiceChannels((prev) => ({ ...prev, [hubChannelId]: defaultHubName }));
            setTextChannels((prev) => ({ ...prev, [interfaceChannelId]: "interface" }));

            const hub = await saveTempVoiceHubAction(guildId, {
                id: null,
                name: "Auto Setup Hub",
                hub_channel_id: hubChannelId,
                category_id: categoryId,
                user_limit: null,
                interface_channel_id: interfaceChannelId,
                guild_id: guildId,
                default_channel_name: "{user.display_name}'s Lounge",
            });

            setHubs((prev) => [...prev, hub]);
            setActiveHubId(hub.id);
            toast.success("Temporary voice channels set up successfully");

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to setup temporary voice.";
            console.error("Setup failed:", error);
            toast.error(errorMessage);
        } finally {
            setIsSettingUp(false);
        }
    }
    return (
        <ConfigListLayout<TempVoiceHub>
            title="Temporary Voice Hubs"
            createButtonText="+ Add Hub"
            onCreateClick={handleCreateNewManual}
            items={hubs}
            renderItem={(hub) => (
                <button
                    key={hub.id}
                    onClick={() => setActiveHubId(hub.id)}
                    className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${
                        activeHubId === hub.id
                            ? "bg-surface-active font-medium"
                            : "hover:bg-surface-muted text-foreground"
                    }`}
                >
                    <div className="font-semibold">{hub.name}</div>
                    <div className="text-muted-foreground mt-0.5">
                        {hub.hub_channel_id && voiceChannels[hub.hub_channel_id]
                            ? `#${voiceChannels[hub.hub_channel_id]}`
                            : "Unconfigured"}
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
                            Create self-managing temporary voice channels that automatically clean up when empty.
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
                            setHubs((prev) => [...prev, savedHub]);
                        } else {
                            setHubs((prev) => prev.map((h) => (h.id === savedHub.id ? savedHub : h)));
                        }
                        setActiveHubId(savedHub.id);
                    }}
                    onDeleteSuccess={() => {
                        setHubs((prev) => prev.filter((h) => h.id !== activeHubId));
                        setActiveHubId(null);
                    }}
                    textChannels={textChannels}
                />
            )}
        </ConfigListLayout>
    );
}