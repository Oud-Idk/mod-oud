"use client";

import React, { useMemo, useState } from "react";
import EmbedBuilder from "@/components/Embed/EmbedBuilder";
import { BuilderConfig } from "@/types/builder";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { sendEmbedAction } from "@/actions/customEmbed";
import { InputLabel } from "@/components/Layout/InputLabel";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";

interface EmbedBuilderBodyProps {
    channelMap: Record<string, string>;
    guildId: string;
}

export function EmbedBuilderBody({ channelMap, guildId }: EmbedBuilderBodyProps) {
    const [embedState, setEmbedState] = useState<object>({});
    const [isEmpty, setIsEmpty] = useState<boolean>(true);
    const [selectedChannel, setSelectedChannel] = useState<string>("");

    const [isSending, setIsSending] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const channelOptions = useMemo(() => {
        return Object.entries(channelMap).map(([id, name]) => ({
            label: name,
            value: id,
        }));
    }, [channelMap]);

    const canSend = selectedChannel && !isEmpty && !isSending;

    const handleSendEmbed = async () => {
        if (!canSend) return;

        setIsSending(true);
        setStatusMessage(null);

        try {
            const result = await sendEmbedAction(guildId, {
                channelId: selectedChannel,
                embedState: embedState,
            });

            if (result.success) {
                setStatusMessage({
                    type: "success",
                    text: `Embed dispatched successfully. Message ID: ${result.messageId}`,
                });
            } else {
                setStatusMessage({
                    type: "error",
                    text: result.error || "An error occurred while sending.",
                });
            }
        } catch (error: any) {
            setStatusMessage({
                type: "error",
                text: error.message || "An unexpected error occurred.",
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
        <div className="flex flex-col space-y-2">
            <div className="flex flex-col my-4 rounded-lg">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col space-y-2 w-64">
                        <InputLabel>
                            Select Channel
                        </InputLabel>
                        <Dropdown
                            value={selectedChannel}
                            onChange={(val: string) => setSelectedChannel(val)}
                            options={channelOptions}
                        />
                    </div>

                    <PrimaryButton
                        onClick={handleSendEmbed} disabled={!canSend}
                    >
                        {isSending ? "Sending Embed..." : "Send Embed"}
                    </PrimaryButton>
                </div>

                {statusMessage && (
                    <div
                        className={`text-sm mt-2 font-medium ${
                            statusMessage.type === "error" ? "text-red-500" : "text-green-500"
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
        </div>
    );
}