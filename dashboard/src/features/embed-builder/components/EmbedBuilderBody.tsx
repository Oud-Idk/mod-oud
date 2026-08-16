"use client";

import React, { JSX, useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { sendEmbedAction } from "@/features/embed-builder/actions";
import { InputLabel } from "@/components/layout/InputLabel";
import { BuilderConfig } from "@/features/_shared/builderConfig";
import EmbedBuilder from "@/features/_shared/message-creator/components/EmbedBuilder";
import { DiscordEmbed } from "@/features/_shared/embed";
import { toast } from "sonner";
import { SendEmbedPayloadSchema } from "@/features/embed-builder/types";
import { Button } from "@/components/ui/Button";

interface EmbedBuilderBodyProps {
    channelMap: Record<string, string>;
    guildId: string;
}

export function EmbedBuilderBody({ channelMap, guildId }: EmbedBuilderBodyProps): JSX.Element {
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
    const [embedState, setEmbedState] = useState<DiscordEmbed>({});

    const [isSending, setIsSending] = useState<boolean>(false);

    const channelOptions = useMemo(() => {
        return Object.entries(channelMap).map(([id, name]) => ({
            label: `#${name}`,
            value: id,
        }));
    }, [channelMap]);

    const handleSendEmbed = async (): Promise<void> => {
        if (selectedChannel === null) {
            toast.error("Please select a channel");
            return;
        }

        const validationResult = SendEmbedPayloadSchema.safeParse({
            channelId: selectedChannel,
            embedState: embedState,
        });

        if (!validationResult.success) {
            const firstMessage = validationResult.error.issues[0].message;
            toast.error(firstMessage);
            return;
        }

        setIsSending(true);

        try {
            const { messageId } = await sendEmbedAction(guildId, {
                channelId: selectedChannel,
                embedState: embedState,
            });

            toast.success(`Embed dispatched successfully. Message ID: ${messageId?.toString() ?? "None? Did Spicy eat the message ID?"}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "An error occurred while sending the embed.");
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

                    <Button onClick={handleSendEmbed} disabled={isSending} className="py-2">
                        {isSending ? "Sending Embed..." : "Send Embed"}
                    </Button>
                </div>
            </div>

            <EmbedBuilder
                config={config}
                initialEmbedState={embedState}
                setEmbedState={setEmbedState}
                enablePlaceholderList={true}
                placeholderConfig={config}
            />
        </>
    );
}