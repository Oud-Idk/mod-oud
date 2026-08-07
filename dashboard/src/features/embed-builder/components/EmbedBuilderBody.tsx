"use client";

import React, { ReactNode, useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { sendEmbedAction } from "@/features/embed-builder/actions";
import { InputLabel } from "@/components/layout/InputLabel";
import PrimaryButton from "@/components/ui/buttons/PrimaryButton";
import { BuilderConfig } from "@/features/_shared/builderConfig";
import EmbedBuilder from "@/features/_shared/message-creator/components/EmbedBuilder";
import { DiscordEmbed } from "@/features/_shared/embed";

interface EmbedBuilderBodyProps {
    channelMap: Record<string, string>;
    guildId: string;
}

export function EmbedBuilderBody({ channelMap, guildId }: EmbedBuilderBodyProps): ReactNode {
    // 1. Honest nullable state for channel & typed DiscordEmbed state
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
    const [embedState, setEmbedState] = useState<DiscordEmbed>({});
    const [isEmpty, setIsEmpty] = useState<boolean>(true);

    const [isSending, setIsSending] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<{ type: "SUCCESS" | "ERROR"; text: string } | null>(null);

    const channelOptions = useMemo(() => {
        return Object.entries(channelMap).map(([id, name]) => ({
            label: `#${name}`,
            value: id,
        }));
    }, [channelMap]);

    const canSend = Boolean(selectedChannel) && !isEmpty && !isSending;

    const handleSendEmbed = async (): Promise<void> => {
        if (!canSend || !selectedChannel) return;

        setIsSending(true);
        setStatusMessage(null);

        try {
            const result = await sendEmbedAction(guildId, {
                channelId: selectedChannel,
                embedState: embedState,
            });

            if (result.success) {
                setStatusMessage({
                    type: "SUCCESS",
                    text: `Embed dispatched successfully. Message ID: ${result.messageId}`,
                });
            } else {
                setStatusMessage({
                    type: "ERROR",
                    text: result.error || "An error occurred while sending.",
                });
            }
        } catch (error) {
            console.error("Failed to dispatch embed:", error);
            setStatusMessage({
                type: "ERROR",
                text: "An unexpected network error occurred while sending the embed.",
            });
        } finally {
            setIsSending(false);
        }
    };

    const config: BuilderConfig = {
        description: "",
        id: "",
        name: "",
        placeholders: [],
    };

    return (
        <>
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col space-y-2 w-64">
                        <InputLabel required>Select Channel</InputLabel>
                        <Dropdown
                            value={selectedChannel}
                            onChange={setSelectedChannel}
                            options={channelOptions}
                            placeholder="Select a channel..."
                        />
                    </div>

                    <PrimaryButton onClick={handleSendEmbed} disabled={!canSend}>
                        {isSending ? "Sending Embed..." : "Send Embed"}
                    </PrimaryButton>
                </div>

                {statusMessage && (
                    <div
                        className={`text-sm mt-1 font-medium ${
                            statusMessage.type === "ERROR" ? "text-danger" : "text-success"
                        }`}
                    >
                        {statusMessage.text}
                    </div>
                )}
            </div>

            <EmbedBuilder
                config={config}
                initialEmbedState={embedState}
                setEmbedState={setEmbedState}
                setIsEmpty={setIsEmpty}
                enablePlaceholderList={true}
                placeholderConfig={config}
            />
        </>
    );
}