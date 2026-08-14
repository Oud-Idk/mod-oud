import React, { JSX, useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { TempVoiceHub } from "@/features/temp-voice/types";
import { sendInterfaceMessageAction } from "@/features/temp-voice/actions";
import { TEMP_VOICE_CHANNEL_BUILDER_CONFIG } from "@/features/temp-voice/builderConfigs";
import EmbedBuilder from "@/features/_shared/message-creator/components/EmbedBuilder";
import { InputLabel } from "@/components/layout/InputLabel";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

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

        try {
            const { messageId } = await sendInterfaceMessageAction(guildId, {
                channelId: selectedChannel,
                embedState: embedState,
            });

            toast.success(`Embed dispatched successfully. Message ID: ${messageId}`);
        } catch (error) {
            console.error("Failed to dispatch embed:", error);

            toast.error(error instanceof Error ? error.message : "An error occurred while sending the embed.");
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
                            onChange={(val) =>{  handleChange({ interface_channel_id: val }); }}
                            options={channelOptions}
                        />
                    </div>

                    <Button
                        onClick={handleSendEmbed}
                        disabled={!canSend}
                        className="py-2"
                    >
                        {isSending ? "Sending Embed..." : "Send Embed"}
                    </Button>
                </div>
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