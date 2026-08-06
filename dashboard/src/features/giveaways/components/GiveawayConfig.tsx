"use client";

import React, { ReactNode, SetStateAction, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextInput } from "@/components/ui/TextInput";
import { Giveaway } from "@/features/giveaways/types";
import { NumberInput } from "@/components/ui/NumberInput";
import { GIVEAWAY_TEMPLATE_CONFIG } from "@/features/giveaways/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { getAvailableChannelOptions } from "@/features/_shared/dropdown";

interface GiveawayConfigProps {
    config: Giveaway;
    channelMap: Record<string, string>;
    isPending: boolean;
    isDirty: boolean;
    isEmpty: boolean;
    guildId: string;
    onDelete: (id: number) => Promise<boolean>;
    onSend: (id: number) => Promise<{ message_id: string }>;
    onChange: (updated: Giveaway) => void;
    setIsEmpty: (isEmpty: SetStateAction<boolean>) => void;
    onDeleteDiscordMessage: (id: number) => Promise<void>;
}

function formatToLocalDateTime(isoString?: string): string {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";

    const pad = (n: number) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function GiveawayConfig({
    config,
    isPending,
    isDirty,
    isEmpty,
    channelMap,
    guildId,
    onDelete,
    onSend,
    onChange,
    setIsEmpty,
    onDeleteDiscordMessage,
}: GiveawayConfigProps): ReactNode {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isActionPending, setIsActionPending] = useState(false);

    const isSent = !!config.message_id && config.message_id.trim() !== "";
    const isDisabled = isPending || isDeleting || isSending;
    const sendToDiscordIsDisabled = isDisabled || isDirty || isEmpty;

    const handleDelete = (id: number): void => {
        setIsDeleting(true);
        onDelete(id)
            .then(() => router.push(`/dashboard/${guildId}/giveaways`))
            .catch(() => {
                alert("Failed to delete giveaway configuration.");
                setIsDeleting(false);
            });
    };

    const handleSend = (): void => {
        if (isDirty) {
            alert("Please save your changes before starting the giveaway.");
            return;
        }
        setIsSending(true);
        onSend(config.id)
            .catch((err) => alert(err.message || "Failed to launch giveaway."))
            .finally(() => setIsSending(false));
    };

    const handleDeleteDiscordMessage = (): void => {
        setIsActionPending(true);
        onDeleteDiscordMessage(config.id)
            .then(() => onChange({ ...config, message_id: undefined }))
            .catch((err) => alert(err.message || "Failed to delete message."))
            .finally(() => setIsActionPending(false));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-semibold text-lg text-foreground">Configure {config.prize}</p>
                <div className="flex items-center gap-2">
                    {isSent ? (
                        <Button
                            variant="danger"
                            disabled={isDisabled || isActionPending}
                            onClick={handleDeleteDiscordMessage}
                        >
                            {isActionPending ? "Deleting..." : "Delete Discord Message"}
                        </Button>
                    ) : (
                        <Button
                            disabled={sendToDiscordIsDisabled}
                            onClick={handleSend}
                        >
                            {isSending ? "Launching..." : "Launch Giveaway"}
                        </Button>
                    )}

                    <Button
                        variant="danger"
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleDelete(config.id)}
                    >
                        {isDeleting ? "Deleting..." : "Delete Giveaway"}
                    </Button>
                </div>
            </div>

            {/* Core Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">Destination Channel</label>
                    <Dropdown
                        options={getAvailableChannelOptions(channelMap)}
                        value={config.channel_id ? String(config.channel_id) : ""}
                        onChange={(val) => onChange({ ...config, channel_id: val })}
                        placeholder="Select channel..."
                        className="w-full"
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">Prize</label>
                    <TextInput
                        placeholder="e.g. 1 Month Nitro"
                        value={config.prize || ""}
                        onChange={(e) => onChange({ ...config, prize: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">Winner Count</label>
                    <NumberInput
                        placeholder="1"
                        value={config.winner_count || 1}
                        onChange={(e) => onChange({ ...config, winner_count: e || 1 })}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-foreground">End Time</label>
                    <span className="text-xs text-muted-foreground">Displayed in local time</span>
                </div>
                <input
                    type="datetime-local"
                    value={formatToLocalDateTime(config.end_time)}
                    onChange={(e) => {
                        if (!e.target.value) return;
                        const utcISOString = new Date(e.target.value).toISOString();
                        onChange({ ...config, end_time: utcISOString });
                    }}
                    className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring w-full max-w-xs cursor-pointer"
                />
            </div>

            {/* Embed / Custom Message Config */}
            <div className="pt-4 border-t border-border-subtle">
                <MessageConfigEditor
                    config={config}
                    onChange={(v) =>
                        onChange({
                            ...config,
                            channel_id: v.channel_id || config.channel_id,
                            content: v.content ?? "",
                            embed: v.embed ?? {},
                            format: v.format,
                        })
                    }
                    onEmbedChange={(v) => onChange({ ...config, embed: v })}
                    embedTemplateConfig={GIVEAWAY_TEMPLATE_CONFIG}
                    setIsEmpty={setIsEmpty}
                    enableToggle={false}
                />
            </div>
        </div>
    );
}