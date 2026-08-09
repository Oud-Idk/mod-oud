import React, { JSX, useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { TempVoiceHub } from "@/features/temp-voice/types";
import { sendInterfaceMessageAction } from "@/features/temp-voice/actions";
import { TEMP_VOICE_CHANNEL_BUILDER_CONFIG } from "@/features/temp-voice/builderConfigs";
import EmbedBuilder from "@/features/_shared/message-creator/components/EmbedBuilder";
import { InputLabel } from "@/components/layout/InputLabel";

interface InterfaceMessageTabProps {
    channelMap: Record<string, string>;
    guildId: string;
    voiceConfig: TempVoiceHub;
    handleChange: (updated: Partial<TempVoiceHub>) => void; // Pass handleChange prop
}

export function InterfaceMessageTab({
    channelMap,
    guildId,
    voiceConfig,
    handleChange,
}: InterfaceMessageTabProps): JSX.Element {
    const [embedState, setEmbedState] = useState<object>({
        title: "Temp Voice Interface",
        description:
            "This interface can be used to manage temporary voice channels. More options are available with /voice commands.",
        color: 0x55ee77,
    });
    const selectedChannel = voiceConfig.interface_channel_id ?? "";

    const [isSending, setIsSending] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<{ type: "SUCCESS" | "ERROR"; text: string } | null>(null);

    const channelOptions = useMemo(() => {
        return Object.entries(channelMap).map(([id, name]) => ({
            label: name,
            value: id,
        }));
    }, [channelMap]);

    const canSend = selectedChannel && !isSending;

    const handleSendEmbed = async (): Promise<void> => {
        if (!canSend || !selectedChannel) return;

        setIsSending(true);
        setStatusMessage(null);

        try {
            const { messageId } = await sendInterfaceMessageAction(guildId, {
                channelId: selectedChannel,
                embedState: embedState,
            });

            setStatusMessage({
                type: "SUCCESS",
                text: `Embed dispatched successfully. Message ID: ${messageId}`,
            });
        } catch (error) {
            console.error("Failed to dispatch embed:", error);

            setStatusMessage({
                type: "ERROR",
                text: error instanceof Error ? error.message : "An error occurred while sending the embed.",
            });
        } finally {
            setIsSending(false);
        }
    };



    return (
        <div className="flex flex-col space-y-2">
            <div className="flex flex-col rounded-lg">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col space-y-2 w-64">
                        <InputLabel className="mt-0">Select Channel</InputLabel>
                        <Dropdown
                            value={selectedChannel}
                            onChange={(val) => handleChange({ interface_channel_id: val })}
                            options={channelOptions}
                        />
                    </div>

                    <button
                        onClick={handleSendEmbed}
                        disabled={!canSend}
                        className={`px-5 py-2.5 rounded font-medium text-sm transition-all ${
                            canSend
                                ? "border border-blue-500 hover:bg-blue-300/15 cursor-pointer"
                                : "border border-neutral-500 text-neutral-500 bg-neutral-300/10 cursor-not-allowed"
                        }`}
                    >
                        {isSending ? "Sending Embed..." : "Send Embed"}
                    </button>
                </div>

                {statusMessage && (
                    <div
                        className={`text-sm mt-2 font-medium ${
                            statusMessage.type === "ERROR" ? "text-red-500" : "text-green-500"
                        }`}
                    >
                        {statusMessage.text}
                    </div>
                )}
            </div>

            <EmbedBuilder
                config={TEMP_VOICE_CHANNEL_BUILDER_CONFIG}
                initialEmbedState={embedState}
                setEmbedState={setEmbedState}
                enablePlaceholderList={true}
                placeholderConfig={TEMP_VOICE_CHANNEL_BUILDER_CONFIG}
            />
        </div>
    );
}